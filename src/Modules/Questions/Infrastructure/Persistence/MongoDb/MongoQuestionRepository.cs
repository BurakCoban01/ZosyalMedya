using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Domain.Questions;

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.MongoDb;
public sealed class MongoQuestionRepository : IQuestionRepository
{
    private static readonly object MappingLock = new(); private readonly IMongoCollection<Question> collection;
    public MongoQuestionRepository(IMongoDatabase database) { ConfigureMappings(); collection = database.GetCollection<Question>("questions"); }
    public Task EnsureIndexesAsync(CancellationToken token) => collection.Indexes.CreateManyAsync([
        new(Builders<Question>.IndexKeys.Ascending(x=>x.TargetId).Ascending(x=>x.Status).Descending(x=>x.CreatedAtUtc),new CreateIndexOptions{Name="ix_inbox"}),
        new(Builders<Question>.IndexKeys.Ascending(x=>x.SenderId).Descending(x=>x.CreatedAtUtc),new CreateIndexOptions{Name="ix_sender"}),
        new(Builders<Question>.IndexKeys.Ascending(x=>x.Status).Ascending(x=>x.PublishAtUtc).Ascending(x=>x.Id),new CreateIndexOptions{Name="ix_scheduled_due"})], token);
    public async Task<IReadOnlyList<Question>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) => await collection
        .Find(x => x.Status == QuestionStatus.Scheduled && x.PublishAtUtc <= now)
        .Sort(Builders<Question>.Sort.Ascending(x => x.PublishAtUtc).Ascending(x => x.Id))
        .Limit(Math.Clamp(limit, 1, 200)).ToListAsync(cancellationToken);
    public async Task<Question?> SelectAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default) { var items = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Question>> ListByFilterAsync(Expression<Func<Question, bool>> predicate, QueryOptions<Question>? options = null, CancellationToken cancellationToken = default) { options ??= new(); var find = collection.Find(predicate); SortDefinition<Question> sort = Builders<Question>.Sort.Ascending(x => x.Id); if (options.Sort is { Count: > 0 }) { var definitions = options.Sort.Select(x => x.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending ? Builders<Question>.Sort.Ascending(x.KeySelector) : Builders<Question>.Sort.Descending(x.KeySelector)).ToList(); definitions.Add(Builders<Question>.Sort.Ascending(x => x.Id)); sort = Builders<Question>.Sort.Combine(definitions); } return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<QuestionId> CreateAsync(Question entity, CancellationToken cancellationToken = default) { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("questions.unique_conflict", "Soru zaten kayıtlıdır.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Question, bool>> predicate, Question replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) { var filter = Builders<Question>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Question>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default) => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    private static void ConfigureMappings() { lock (MappingLock) { if (!BsonClassMap.IsClassMapRegistered(typeof(QuestionId))) BsonClassMap.RegisterClassMap<QuestionId>(m => { m.AutoMap(); m.MapCreator(x => new QuestionId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); }); if (!BsonClassMap.IsClassMapRegistered(typeof(QuestionUserId))) BsonClassMap.RegisterClassMap<QuestionUserId>(m => { m.AutoMap(); m.MapCreator(x => new QuestionUserId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); }); if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<QuestionId>))) BsonClassMap.RegisterClassMap<AggregateRoot<QuestionId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); }); if (!BsonClassMap.IsClassMapRegistered(typeof(Question))) BsonClassMap.RegisterClassMap<Question>(m => m.AutoMap()); } }
}
