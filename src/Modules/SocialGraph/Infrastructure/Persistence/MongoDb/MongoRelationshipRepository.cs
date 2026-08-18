using System.Linq.Expressions;
using System.Diagnostics;
using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.MongoDb;

public sealed class MongoRelationshipRepository : IRelationshipRepository
{
    private static readonly object MappingLock = new();
    private readonly IMongoCollection<Relationship> _relationships;
    private readonly IMongoCollection<BsonDocument> _rawRelationships;
    private readonly TimeProvider _timeProvider;
    public MongoRelationshipRepository(IMongoDatabase database) : this(database, TimeProvider.System) { }
    public MongoRelationshipRepository(IMongoDatabase database, TimeProvider timeProvider) { ConfigureMappings(); _relationships = database.GetCollection<Relationship>("relationships"); _rawRelationships = database.GetCollection<BsonDocument>("relationships"); _timeProvider = timeProvider; }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken) => await _relationships.Indexes.CreateManyAsync([
        new(Builders<Relationship>.IndexKeys.Ascending(x => x.ActorId).Ascending(x => x.TargetId), new CreateIndexOptions { Unique = true, Name = "ux_actor_target" }),
        new(Builders<Relationship>.IndexKeys.Ascending(x => x.TargetId).Ascending(x => x.FollowState), new CreateIndexOptions { Name = "ix_target_state" }),
        new(Builders<Relationship>.IndexKeys.Ascending("_pendingEvents.ProcessedAtUtc").Ascending("_pendingEvents.NextAttemptAtUtc"), new CreateIndexOptions { Name = "ix_embedded_outbox" })
    ], cancellationToken);

    public async Task<Relationship?> SelectAsync(Expression<Func<Relationship, bool>> predicate, CancellationToken cancellationToken = default)
    { var matches = await _relationships.Find(predicate).Limit(2).ToListAsync(cancellationToken); return matches.SingleOrDefault(); }

    public async Task<IReadOnlyList<Relationship>> ListByFilterAsync(Expression<Func<Relationship, bool>> predicate, QueryOptions<Relationship>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<Relationship>();
        var find = _relationships.Find(predicate);
        SortDefinition<Relationship> sort = Builders<Relationship>.Sort.Descending(x => x.UpdatedAtUtc).Ascending(x => x.Id);
        if (options.Sort is { Count: > 0 })
        {
            var definitions = options.Sort.Select(item => item.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending
                ? Builders<Relationship>.Sort.Ascending(item.KeySelector) : Builders<Relationship>.Sort.Descending(item.KeySelector)).ToList();
            definitions.Add(Builders<Relationship>.Sort.Ascending(x => x.Id)); sort = Builders<Relationship>.Sort.Combine(definitions);
        }
        return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<RelationshipId> CreateAsync(Relationship entity, CancellationToken cancellationToken = default)
    {
        try
        {
            var document=entity.ToBsonDocument();document["_pendingEvents"]=PendingEvents(entity);
            await _rawRelationships.InsertOneAsync(document,cancellationToken:cancellationToken);
            entity.ClearDomainEvents();return entity.Id;
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { throw new PersistenceConflictException("social_graph.unique_conflict", "İlişki zaten kayıtlıdır.", exception); }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Relationship, bool>> predicate, Relationship replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Relationship>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<Relationship>.Filter.Eq(x => x.Version, expectedVersion.Value);
        var document=replacement.ToBsonDocument();document.Remove("_id");
        var update=new BsonDocument("$set",document);
        var pending=PendingEvents(replacement);
        if(pending.Count>0)update["$push"]=new BsonDocument("_pendingEvents",new BsonDocument("$each",pending));
        var modified=(await _relationships.UpdateOneAsync(filter,new BsonDocumentUpdateDefinition<Relationship>(update),cancellationToken:cancellationToken)).ModifiedCount==1;
        if(modified)replacement.ClearDomainEvents();return modified;
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Relationship, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await _relationships.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    public Task<long> CountAsync(GraphUserId ownerId, RelationshipReadKind kind,
        CancellationToken cancellationToken = default) =>
        _relationships.CountDocumentsAsync(Filter(ownerId, kind), cancellationToken: cancellationToken);

    public async Task<IReadOnlyList<Relationship>> ListPageAsync(RelationshipPageQuery query,
        CancellationToken cancellationToken = default) => await _relationships.Find(Filter(query.OwnerId, query.Kind))
        .Sort(Builders<Relationship>.Sort.Descending(x => x.UpdatedAtUtc).Ascending(x => x.Id))
        .Skip(Math.Max(0, query.Offset)).Limit(Math.Clamp(query.Limit, 1, 51))
        .ToListAsync(cancellationToken);

    private static Expression<Func<Relationship, bool>> Filter(GraphUserId ownerId, RelationshipReadKind kind) => kind switch
    {
        RelationshipReadKind.Followers => x => x.TargetId == ownerId && x.FollowState == FollowState.Following && !x.IsBlocked,
        RelationshipReadKind.Following => x => x.ActorId == ownerId && x.FollowState == FollowState.Following && !x.IsBlocked,
        RelationshipReadKind.PendingIncoming => x => x.TargetId == ownerId && x.FollowState == FollowState.Pending && !x.IsBlocked,
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(RelationshipId))) BsonClassMap.RegisterClassMap<RelationshipId>(map => { map.AutoMap(); map.MapCreator(id => new RelationshipId(id.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(MongoDB.Bson.GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(GraphUserId))) BsonClassMap.RegisterClassMap<GraphUserId>(map => { map.AutoMap(); map.MapCreator(id => new GraphUserId(id.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(MongoDB.Bson.GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<RelationshipId>))) BsonClassMap.RegisterClassMap<AggregateRoot<RelationshipId>>(map => { map.AutoMap(); map.MapIdMember(x => x.Id); map.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Relationship))) BsonClassMap.RegisterClassMap<Relationship>(map => { map.AutoMap(); map.SetIgnoreExtraElements(true); });
        }
    }

    private BsonArray PendingEvents(Relationship entity)
    {
        var now=_timeProvider.GetUtcNow();var correlationId=Activity.Current?.TraceId.ToString()??Guid.NewGuid().ToString("N");
        return new BsonArray(entity.DomainEvents.Select(domainEvent=>{var eventType=domainEvent.GetType();return new BsonDocument
        {
            ["Id"]=new BsonBinaryData(Guid.NewGuid(),GuidRepresentation.Standard),["Type"]=$"{eventType.FullName}:v1",
            ["Payload"]=JsonSerializer.Serialize(domainEvent,eventType),["CorrelationId"]=correlationId,
            ["OccurredAtUtc"]=domainEvent.OccurredAtUtc.UtcDateTime,["CreatedAtUtc"]=now.UtcDateTime,["NextAttemptAtUtc"]=now.UtcDateTime,
            ["Attempts"]=0,["LastError"]=string.Empty,["ProcessedAtUtc"]=BsonNull.Value,["DeadLetteredAtUtc"]=BsonNull.Value,
            ["LockedBy"]=BsonNull.Value,["LockedUntilUtc"]=BsonNull.Value
        };}));
    }
}
