using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;

public sealed class MongoUserSessionRepository : IUserSessionRepository
{
    private readonly IMongoCollection<UserSession> _sessions;

    public MongoUserSessionRepository(IMongoDatabase database)
    {
        ConfigureMappings();
        _sessions = database.GetCollection<UserSession>("identity_sessions");
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken)
    {
        var models = new[]
        {
            new CreateIndexModel<UserSession>(Builders<UserSession>.IndexKeys.Ascending(x => x.RefreshTokenHash), new CreateIndexOptions { Unique = true, Name = "ux_refresh_hash" }),
            new CreateIndexModel<UserSession>(Builders<UserSession>.IndexKeys.Ascending(x => x.UserId).Ascending(x => x.DeviceId), new CreateIndexOptions { Name = "ix_user_device" }),
            new CreateIndexModel<UserSession>(Builders<UserSession>.IndexKeys.Ascending(x => x.ExpiresAtUtc), new CreateIndexOptions { ExpireAfter = TimeSpan.Zero, Name = "ttl_expired_sessions" })
        };
        await _sessions.Indexes.CreateManyAsync(models, cancellationToken);
    }

    public async Task<UserSession?> FindByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        var filter = Builders<UserSession>.Filter.Eq(x => x.RefreshTokenHash, tokenHash)
            | new BsonDocumentFilterDefinition<UserSession>(new BsonDocument("consumedTokenHashes", tokenHash));
        var matches = await _sessions.Find(filter).Limit(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<UserSession?> SelectAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await _sessions.Find(predicate).Limit(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<UserSession>> ListByFilterAsync(
        Expression<Func<UserSession, bool>> predicate,
        QueryOptions<UserSession>? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<UserSession>();
        var find = _sessions.Find(predicate);
        SortDefinition<UserSession> sort = Builders<UserSession>.Sort.Descending(x => x.LastUsedAtUtc).Ascending(x => x.Id);
        if (options.Sort is { Count: > 0 })
        {
            var definitions = options.Sort.Select(item => item.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending
                ? Builders<UserSession>.Sort.Ascending(item.KeySelector)
                : Builders<UserSession>.Sort.Descending(item.KeySelector)).ToList();
            definitions.Add(Builders<UserSession>.Sort.Ascending(x => x.Id));
            sort = Builders<UserSession>.Sort.Combine(definitions);
        }
        return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<SessionId> CreateAsync(UserSession entity, CancellationToken cancellationToken = default)
    {
        try
        {
            await _sessions.InsertOneAsync(entity, cancellationToken: cancellationToken);
            return entity.Id;
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PersistenceConflictException("identity.session_conflict", "Oturum oluşturulamadı.", exception);
        }
    }

    public async Task<bool> UpdateAsync(
        Expression<Func<UserSession, bool>> predicate,
        UserSession replacement,
        long? expectedVersion = null,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<UserSession>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<UserSession>.Filter.Eq(x => x.Version, expectedVersion.Value);
        var result = await _sessions.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken);
        return result.ModifiedCount == 1;
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await _sessions.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    private static void ConfigureMappings()
    {
        lock (MongoIdentityMappingGate.SyncRoot)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(UserId)))
            {
                BsonClassMap.RegisterClassMap<UserId>(map =>
                {
                    map.AutoMap();
                    map.MapCreator(id => new UserId(id.Value));
                    map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                });
            }
            if (!BsonClassMap.IsClassMapRegistered(typeof(SessionId)))
            {
                BsonClassMap.RegisterClassMap<SessionId>(map =>
                {
                    map.AutoMap();
                    map.MapCreator(id => new SessionId(id.Value));
                    map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                });
            }
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<SessionId>)))
            {
                BsonClassMap.RegisterClassMap<AggregateRoot<SessionId>>(map =>
                {
                    map.AutoMap();
                    map.MapIdMember(x => x.Id);
                    map.UnmapMember(x => x.DomainEvents);
                });
            }
            if (!BsonClassMap.IsClassMapRegistered(typeof(UserSession)))
            {
                BsonClassMap.RegisterClassMap<UserSession>(map =>
                {
                    map.AutoMap();
                    map.MapField("_consumedTokenHashes").SetElementName("consumedTokenHashes");
                    map.UnmapMember(x => x.ConsumedTokenHashes);
                    map.UnmapMember(x => x.IsRevoked);
                });
            }
        }
    }
}
