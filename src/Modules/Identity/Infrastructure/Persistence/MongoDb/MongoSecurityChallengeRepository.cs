using System.Linq.Expressions;
using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;

public sealed class MongoSecurityChallengeRepository : ISecurityChallengeRepository
{
    private readonly IMongoCollection<SecurityChallenge> collection;

    public MongoSecurityChallengeRepository(IMongoDatabase database)
    {
        ConfigureMappings();
        collection = database.GetCollection<SecurityChallenge>("identity_security_challenges");
    }

    public async Task EnsureIndexesAsync(CancellationToken token) => await collection.Indexes.CreateManyAsync([
        new CreateIndexModel<SecurityChallenge>(Builders<SecurityChallenge>.IndexKeys.Ascending(x => x.TokenHash).Ascending(x => x.Purpose), new() { Unique = true }),
        new CreateIndexModel<SecurityChallenge>(Builders<SecurityChallenge>.IndexKeys.Ascending(x => x.ExpiresAtUtc), new() { ExpireAfter = TimeSpan.Zero })
    ], token);

    public async Task<SecurityChallenge?> FindByTokenHashAsync(string tokenHash, SecurityChallengePurpose purpose, CancellationToken cancellationToken = default) =>
        await collection.Find(x => x.TokenHash == tokenHash && x.Purpose == purpose).SingleOrDefaultAsync(cancellationToken);
    public async Task<SecurityChallenge?> SelectAsync(Expression<Func<SecurityChallenge, bool>> predicate, CancellationToken cancellationToken = default) =>
        await collection.Find(predicate).Limit(2).SingleOrDefaultAsync(cancellationToken);
    public async Task<IReadOnlyList<SecurityChallenge>> ListByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate,
        QueryOptions<SecurityChallenge>? options = null, CancellationToken cancellationToken = default) =>
        await collection.Find(predicate).SortByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Limit((options ?? new()).BoundedLimit).ToListAsync(cancellationToken);
    public async Task<SecurityChallengeId> CreateAsync(SecurityChallenge entity, CancellationToken cancellationToken = default)
    { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; }
    public async Task<bool> UpdateAsync(Expression<Func<SecurityChallenge, bool>> predicate, SecurityChallenge replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var filter = Builders<SecurityChallenge>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<SecurityChallenge>.Filter.Eq(x => x.Version, expectedVersion.Value);
        return (await collection.ReplaceOneAsync(filter, replacement, cancellationToken: cancellationToken)).ModifiedCount == 1;
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    private static void ConfigureMappings()
    {
        lock (MongoIdentityMappingGate.SyncRoot)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(UserId)))
                BsonClassMap.RegisterClassMap<UserId>(map =>
                {
                    map.AutoMap();
                    map.MapCreator(id => new UserId(id.Value));
                    map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                });
            if (!BsonClassMap.IsClassMapRegistered(typeof(SecurityChallengeId)))
                BsonClassMap.RegisterClassMap<SecurityChallengeId>(map =>
                {
                    map.AutoMap();
                    map.MapCreator(id => new SecurityChallengeId(id.Value));
                    map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<SecurityChallengeId>)))
                BsonClassMap.RegisterClassMap<AggregateRoot<SecurityChallengeId>>(map =>
                {
                    map.AutoMap();
                    map.MapIdMember(x => x.Id);
                    map.UnmapMember(x => x.DomainEvents);
                });
            if (!BsonClassMap.IsClassMapRegistered(typeof(SecurityChallenge)))
                BsonClassMap.RegisterClassMap<SecurityChallenge>(map => map.AutoMap());
        }
    }
}
