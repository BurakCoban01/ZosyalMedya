using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;

namespace ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.MongoDb;

public sealed class MongoProfileRepository : IProfileRepository
{
    private static readonly object MappingLock = new();
    private readonly IMongoCollection<Profile> _profiles;

    public MongoProfileRepository(IMongoDatabase database)
    {
        ConfigureMappings();
        _profiles = database.GetCollection<Profile>("profiles");
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken) =>
        await _profiles.Indexes.CreateManyAsync([
            new(Builders<Profile>.IndexKeys.Ascending(x => x.OwnerId), new CreateIndexOptions { Unique = true, Name = "ux_owner" }),
            new(Builders<Profile>.IndexKeys.Ascending(x => x.NormalizedHandle), new CreateIndexOptions { Unique = true, Name = "ux_handle" })
        ], cancellationToken);

    public async Task<Profile?> SelectAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await _profiles.Find(predicate).Limit(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<Profile>> ListByFilterAsync(Expression<Func<Profile, bool>> predicate, QueryOptions<Profile>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<Profile>();
        var find = _profiles.Find(predicate);
        SortDefinition<Profile> sort = Builders<Profile>.Sort.Ascending(x => x.Id);
        if (options.Sort is { Count: > 0 })
        {
            var definitions = options.Sort.Select(item => item.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending
                ? Builders<Profile>.Sort.Ascending(item.KeySelector) : Builders<Profile>.Sort.Descending(item.KeySelector)).ToList();
            definitions.Add(Builders<Profile>.Sort.Ascending(x => x.Id));
            sort = Builders<Profile>.Sort.Combine(definitions);
        }
        return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<ProfileId> CreateAsync(Profile entity, CancellationToken cancellationToken = default)
    {
        try { await _profiles.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { throw new PersistenceConflictException("profiles.unique_conflict", "Profil sahibi veya kullanıcı adı zaten kayıtlıdır.", exception); }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Profile, bool>> predicate, Profile replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Profile>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<Profile>.Filter.Eq(x => x.Version, expectedVersion.Value);
        return (await _profiles.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken)).ModifiedCount == 1;
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await _profiles.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(ProfileId)))
                BsonClassMap.RegisterClassMap<ProfileId>(map => { map.AutoMap(); map.MapCreator(id => new ProfileId(id.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ProfileOwnerId)))
                BsonClassMap.RegisterClassMap<ProfileOwnerId>(map => { map.AutoMap(); map.MapCreator(id => new ProfileOwnerId(id.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<ProfileId>)))
                BsonClassMap.RegisterClassMap<AggregateRoot<ProfileId>>(map => { map.AutoMap(); map.MapIdMember(x => x.Id); map.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Profile)))
                BsonClassMap.RegisterClassMap<Profile>(map => { map.AutoMap(); map.UnmapMember(x => x.CompletenessPercentage); });
        }
    }
}
