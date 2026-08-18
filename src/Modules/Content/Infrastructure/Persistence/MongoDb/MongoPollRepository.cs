using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;

public sealed class MongoPollRepository : IPollRepository
{
    private static readonly object MappingLock = new();
    private readonly IMongoCollection<Poll> polls;
    private readonly IMongoCollection<MongoPollBallot> ballots;
    public MongoPollRepository(IMongoDatabase database)
    {
        ConfigureMappings(); polls = database.GetCollection<Poll>("polls"); ballots = database.GetCollection<MongoPollBallot>("poll_ballots");
    }
    public Task EnsureIndexesAsync(CancellationToken token) => Task.WhenAll(
        polls.Indexes.CreateOneAsync(new CreateIndexModel<Poll>(Builders<Poll>.IndexKeys.Ascending(x => x.PostId), new() { Unique = true, Name = "ux_post" }), cancellationToken: token),
        ballots.Indexes.CreateOneAsync(new CreateIndexModel<MongoPollBallot>(Builders<MongoPollBallot>.IndexKeys.Ascending(x => x.PollId).Ascending(x => x.ActorId), new() { Unique = true, Name = "ux_ballot" }), cancellationToken: token));
    public Task<Poll?> GetByPostAsync(PostId postId, CancellationToken cancellationToken = default) => polls.Find(x => x.PostId == postId).SingleOrDefaultAsync(cancellationToken)!;
    public async Task<IReadOnlySet<PostId>> ListExistingPostIdsAsync(IReadOnlySet<PostId> postIds,
        CancellationToken cancellationToken = default)
    {
        if (postIds.Count == 0) return new HashSet<PostId>();
        return (await polls.Find(Builders<Poll>.Filter.In(x => x.PostId, postIds))
            .Project(x => x.PostId)
            .ToListAsync(cancellationToken))
            .ToHashSet();
    }
    public Task CreateAsync(Poll poll, CancellationToken cancellationToken = default) => polls.InsertOneAsync(poll, cancellationToken: cancellationToken);
    public async Task<PollVoteOutcome> CastVoteAsync(PollId pollId, Guid actorId, IReadOnlySet<PollOptionId> optionIds, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        try { await ballots.InsertOneAsync(new MongoPollBallot(pollId, actorId, optionIds, now), cancellationToken: cancellationToken); }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { return PollVoteOutcome.AlreadyVoted; }
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var poll = await polls.Find(x => x.Id == pollId).SingleOrDefaultAsync(cancellationToken);
            if (poll is null) { await RemoveBallotAsync(); return PollVoteOutcome.PollNotFound; }
            var version = poll.Version;
            try { poll.RegisterVote(optionIds, now); }
            catch (DomainRuleException exception) { await RemoveBallotAsync(); return exception.Code == "poll.closed" ? PollVoteOutcome.Closed : PollVoteOutcome.InvalidOptions; }
            var filter = Builders<Poll>.Filter.Eq(x => x.Id, pollId) & Builders<Poll>.Filter.Eq(x => x.Version, version);
            if ((await polls.ReplaceOneAsync(filter, poll, cancellationToken: cancellationToken)).ModifiedCount == 1) return PollVoteOutcome.Accepted;
        }
        await RemoveBallotAsync(); throw new InvalidOperationException("Anket oyu eşzamanlı güncellemeler nedeniyle kaydedilemedi.");
        async Task RemoveBallotAsync() => await ballots.DeleteOneAsync(x => x.PollId == pollId && x.ActorId == actorId, cancellationToken);
    }
    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(PollId))) BsonClassMap.RegisterClassMap<PollId>(m => { m.AutoMap(); m.MapCreator(x => new PollId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(PollOptionId))) BsonClassMap.RegisterClassMap<PollOptionId>(m => { m.AutoMap(); m.MapCreator(x => new PollOptionId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<PollId>))) BsonClassMap.RegisterClassMap<AggregateRoot<PollId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(PollOption))) BsonClassMap.RegisterClassMap<PollOption>(m => m.AutoMap());
            if (!BsonClassMap.IsClassMapRegistered(typeof(Poll))) BsonClassMap.RegisterClassMap<Poll>(m => { m.AutoMap(); m.UnmapMember(x => x.Options); m.MapField("_options").SetElementName("options"); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(MongoPollBallot))) BsonClassMap.RegisterClassMap<MongoPollBallot>(m =>
            {
                m.AutoMap(); m.MapIdMember(x => x.Id).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                m.MapMember(x => x.ActorId).SetSerializer(new GuidSerializer(GuidRepresentation.Standard));
                m.MapMember(x => x.OptionIds).SetSerializer(new ArraySerializer<Guid>(new GuidSerializer(GuidRepresentation.Standard)));
            });
        }
    }
}

public sealed class MongoPollBallot
{
    [BsonConstructor]
    public MongoPollBallot() { OptionIds = []; }
    internal MongoPollBallot(PollId pollId, Guid actorId, IEnumerable<PollOptionId> optionIds, DateTimeOffset castAtUtc)
    { Id = Guid.NewGuid(); PollId = pollId; ActorId = actorId; OptionIds = optionIds.Select(x => x.Value).ToArray(); CastAtUtc = castAtUtc; }
    public Guid Id { get; private set; } public PollId PollId { get; private set; } public Guid ActorId { get; private set; }
    public Guid[] OptionIds { get; private set; } public DateTimeOffset CastAtUtc { get; private set; }
}
