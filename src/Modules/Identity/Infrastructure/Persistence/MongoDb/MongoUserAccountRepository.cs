using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;

public sealed class MongoUserAccountRepository : IUserAccountRepository
{
    private readonly IMongoCollection<UserAccount> _users;

    public MongoUserAccountRepository(IMongoDatabase database)
    {
        ConfigureMappings();
        _users = database.GetCollection<UserAccount>("identity_users");
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken)
    {
        var models = new[]
        {
            new CreateIndexModel<UserAccount>(Builders<UserAccount>.IndexKeys.Ascending(x => x.NormalizedUsername), new CreateIndexOptions { Unique = true, Name = "ux_username" }),
            new CreateIndexModel<UserAccount>(Builders<UserAccount>.IndexKeys.Ascending(x => x.NormalizedEmail), new CreateIndexOptions { Unique = true, Name = "ux_email" })
        };
        await _users.Indexes.CreateManyAsync(models, cancellationToken);
    }

    public async Task<IReadOnlyList<UserAccount>> ListVisitorPageAsync(string emailDomain, UserId? afterId, int limit,
        CancellationToken cancellationToken = default)
    {
        var suffix = "@" + emailDomain.Trim().TrimStart('@').ToUpperInvariant();
        var filter = Builders<UserAccount>.Filter.Regex(x => x.NormalizedEmail,
            new BsonRegularExpression($"{System.Text.RegularExpressions.Regex.Escape(suffix)}$"));
        if (afterId.HasValue)
            filter &= Builders<UserAccount>.Filter.Gt(x => x.Id, afterId.Value);
        return await _users.Find(filter).SortBy(x => x.Id)
            .Limit(Math.Clamp(limit, 1, QueryOptions<UserAccount>.MaximumLimit))
            .ToListAsync(cancellationToken);
    }

    public async Task<UserAccount?> SelectAsync(Expression<Func<UserAccount, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await _users.Find(predicate).Limit(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<UserAccount>> ListByFilterAsync(
        Expression<Func<UserAccount, bool>> predicate,
        QueryOptions<UserAccount>? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<UserAccount>();
        var find = _users.Find(predicate);
        SortDefinition<UserAccount> sort = Builders<UserAccount>.Sort.Ascending(x => x.Id);
        if (options.Sort is { Count: > 0 })
        {
            var definitions = options.Sort.Select(item => item.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending
                ? Builders<UserAccount>.Sort.Ascending(item.KeySelector)
                : Builders<UserAccount>.Sort.Descending(item.KeySelector)).ToList();
            definitions.Add(Builders<UserAccount>.Sort.Ascending(x => x.Id));
            sort = Builders<UserAccount>.Sort.Combine(definitions);
        }
        return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<UserId> CreateAsync(UserAccount entity, CancellationToken cancellationToken = default)
    {
        try
        {
            await _users.InsertOneAsync(entity, cancellationToken: cancellationToken);
            return entity.Id;
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PersistenceConflictException("identity.unique_conflict", "Kullanıcı adı veya e-posta zaten kayıtlıdır.", exception);
        }
    }

    public async Task<bool> UpdateAsync(
        Expression<Func<UserAccount, bool>> predicate,
        UserAccount replacement,
        long? expectedVersion = null,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<UserAccount>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<UserAccount>.Filter.Eq(x => x.Version, expectedVersion.Value);
        var result = await _users.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken);
        return result.ModifiedCount == 1;
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<UserAccount, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await _users.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

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
            if (!BsonClassMap.IsClassMapRegistered(typeof(UserAccount)))
            {
                if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<UserId>)))
                {
                    BsonClassMap.RegisterClassMap<AggregateRoot<UserId>>(map =>
                    {
                        map.AutoMap();
                        map.MapIdMember(x => x.Id);
                        map.UnmapMember(x => x.DomainEvents);
                    });
                }
                BsonClassMap.RegisterClassMap<UserAccount>(map =>
                {
                    map.AutoMap();
                });
            }
        }
    }
}
