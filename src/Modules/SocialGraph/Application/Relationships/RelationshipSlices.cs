using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

namespace ZosyalMedya.Modules.SocialGraph.Application.Relationships;

public sealed record RelationshipView(Guid ActorId, Guid TargetId, FollowState FollowState, bool IsBlocked, bool IsBlockedByTarget, bool IsMuted, bool IsCloseFriend, long Version);

public sealed class FollowHandler(IRelationshipRepository relationships, IProfilesModule profiles, IClock clock)
{
    public async Task<Result<RelationshipView>> HandleAsync(GraphUserId actorId, GraphUserId targetId, CancellationToken cancellationToken)
    {
        if (actorId == targetId)
            return Result.Failure<RelationshipView>("social_graph.self_relationship", "Kullanıcı kendisini takip edemez.");
        var target = await profiles.FindByOwnerIdAsync(targetId.Value, cancellationToken);
        if (target is null)
            return Result.Failure<RelationshipView>("social_graph.target_not_found", "Hedef profil bulunamadı.");
        var reverse = await relationships.SelectAsync(x => x.ActorId == targetId && x.TargetId == actorId, cancellationToken);
        if (reverse?.IsBlocked == true)
            return Result.Failure<RelationshipView>("social_graph.blocked", "Bu ilişki engellenmiştir.");

        var relationship = await relationships.SelectAsync(x => x.ActorId == actorId && x.TargetId == targetId, cancellationToken);
        if (relationship is null)
        {
            relationship = Relationship.Create(RelationshipId.New(), actorId, targetId, clock.UtcNow);
            try
            {
                relationship.RequestFollow(target.IsPrivate, clock.UtcNow);
                await relationships.CreateAsync(relationship, cancellationToken);
            }
            catch (DomainRuleException exception)
            {
                return Result.Failure<RelationshipView>(exception.Code, exception.Message);
            }
            catch (ZosyalMedya.BuildingBlocks.Application.Persistence.PersistenceConflictException)
            {
                var concurrent = await relationships.SelectAsync(x => x.ActorId == actorId && x.TargetId == targetId, cancellationToken);
                if (concurrent is null)
                    return Result.Failure<RelationshipView>("social_graph.concurrency_conflict", "İlişki eşzamanlı oluşturuldu.");
                relationship = concurrent;
            }
        }
        else
        {
            var expectedVersion = relationship.Version;
            try { relationship.RequestFollow(target.IsPrivate, clock.UtcNow); }
            catch (DomainRuleException exception) { return Result.Failure<RelationshipView>(exception.Code, exception.Message); }
            if (relationship.Version != expectedVersion && !await relationships.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion, cancellationToken))
                return Result.Failure<RelationshipView>("social_graph.concurrency_conflict", "İlişki eşzamanlı güncellendi.");
        }
        return Result.Success(Map(relationship, reverse?.IsBlocked == true));
    }

    internal static RelationshipView Map(Relationship relationship, bool blockedByTarget) => new(
        relationship.ActorId.Value, relationship.TargetId.Value, relationship.FollowState, relationship.IsBlocked,
        blockedByTarget, relationship.IsMuted, relationship.IsCloseFriend, relationship.Version);
}

public sealed class AcceptFollowHandler(IRelationshipRepository relationships, IClock clock)
{
    public async Task<Result<RelationshipView>> HandleAsync(GraphUserId targetOwnerId, GraphUserId requesterId, CancellationToken cancellationToken)
    {
        var relationship = await relationships.SelectAsync(x => x.ActorId == requesterId && x.TargetId == targetOwnerId, cancellationToken);
        if (relationship is null)
            return Result.Failure<RelationshipView>("social_graph.request_not_found", "Takip isteği bulunamadı.");
        var expectedVersion = relationship.Version;
        try { relationship.AcceptFollow(clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<RelationshipView>(exception.Code, exception.Message); }
        return await relationships.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion, cancellationToken)
            ? Result.Success(FollowHandler.Map(relationship, false))
            : Result.Failure<RelationshipView>("social_graph.concurrency_conflict", "İlişki eşzamanlı güncellendi.");
    }
}

public sealed class RejectFollowHandler(IRelationshipRepository relationships, IClock clock)
{
    public async Task<Result<RelationshipView>> HandleAsync(GraphUserId targetOwnerId, GraphUserId requesterId,
        CancellationToken cancellationToken)
    {
        var relationship = await relationships.SelectAsync(
            x => x.ActorId == requesterId && x.TargetId == targetOwnerId, cancellationToken);
        if (relationship is null || relationship.FollowState != FollowState.Pending)
            return Result.Failure<RelationshipView>("social_graph.request_not_found", "Takip isteği bulunamadı.");
        var expectedVersion = relationship.Version;
        relationship.Unfollow(clock.UtcNow);
        return await relationships.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion, cancellationToken)
            ? Result.Success(FollowHandler.Map(relationship, false))
            : Result.Failure<RelationshipView>("social_graph.concurrency_conflict", "İlişki eşzamanlı güncellendi.");
    }
}

public enum SocialGraphListKind { Followers, Following }
public sealed record SocialGraphSummaryView(Guid OwnerId, long FollowerCount, long FollowingCount,
    long PendingRequestCount, bool CanManageRequests);
public sealed record SocialGraphProfileView(Guid OwnerId, string Handle, string DisplayName,
    Guid? ProfileMediaId, bool IsVerified);
public sealed record SocialGraphPage(IReadOnlyList<SocialGraphProfileView> Items, string? NextCursor);

public sealed class SocialGraphReadHandler(IRelationshipRepository relationships, IProfilesModule profiles)
{
    private const int MaxCursorOffset = 10_000;
    public async Task<Result<SocialGraphSummaryView>> SummaryAsync(GraphUserId viewerId, GraphUserId ownerId,
        CancellationToken cancellationToken)
    {
        var authorization = await AuthorizeAsync(viewerId, ownerId, cancellationToken);
        if (!authorization.IsSuccess)
            return Result.Failure<SocialGraphSummaryView>(authorization.Error.Code, authorization.Error.Message);
        var followers = await relationships.CountAsync(ownerId, RelationshipReadKind.Followers, cancellationToken);
        var following = await relationships.CountAsync(ownerId, RelationshipReadKind.Following, cancellationToken);
        var pending = viewerId == ownerId
            ? await relationships.CountAsync(ownerId, RelationshipReadKind.PendingIncoming, cancellationToken)
            : 0;
        return Result.Success(new SocialGraphSummaryView(ownerId.Value, followers, following, pending, viewerId == ownerId));
    }

    public Task<Result<SocialGraphPage>> ListAsync(GraphUserId viewerId, GraphUserId ownerId,
        SocialGraphListKind kind, int limit, string? cursor, CancellationToken cancellationToken) =>
        ListCoreAsync(viewerId, ownerId,
            kind == SocialGraphListKind.Followers ? RelationshipReadKind.Followers : RelationshipReadKind.Following,
            limit, cursor, false, cancellationToken);

    public Task<Result<SocialGraphPage>> IncomingAsync(GraphUserId ownerId, int limit, string? cursor,
        CancellationToken cancellationToken) =>
        ListCoreAsync(ownerId, ownerId, RelationshipReadKind.PendingIncoming, limit, cursor, true, cancellationToken);

    private async Task<Result<SocialGraphPage>> ListCoreAsync(GraphUserId viewerId, GraphUserId ownerId,
        RelationshipReadKind kind, int limit, string? cursor, bool revealRequesters, CancellationToken token)
    {
        var authorization = await AuthorizeAsync(viewerId, ownerId, token);
        if (!authorization.IsSuccess)
            return Result.Failure<SocialGraphPage>(authorization.Error.Code, authorization.Error.Message);
        limit = Math.Clamp(limit, 1, 50);
        var offset = DecodeCursor(cursor);
        var raw = await relationships.ListPageAsync(new(ownerId, kind, offset, limit + 1), token);
        var pageRows = raw.Take(limit).ToArray();
        var candidateIds = pageRows.Select(row => kind == RelationshipReadKind.Following
            ? row.TargetId.Value : row.ActorId.Value).ToHashSet();
        var profileMap = await profiles.FindByOwnerIdsAsync(candidateIds, token);
        var visibleIds = revealRequesters
            ? candidateIds
            : await VisibleProfileIdsAsync(viewerId, profileMap, token);
        var items = pageRows.Select(row => kind == RelationshipReadKind.Following
                ? row.TargetId.Value : row.ActorId.Value)
            .Where(id => visibleIds.Contains(id) && profileMap.ContainsKey(id))
            .Select(id => profileMap[id])
            .Select(profile => new SocialGraphProfileView(profile.OwnerId, profile.Handle, profile.DisplayName,
                profile.ProfileMediaId, profile.IsVerified))
            .ToArray();
        return Result.Success(new SocialGraphPage(items, raw.Count > limit ? EncodeCursor(offset + limit) : null));
    }

    private async Task<Result<ProfileLookup>> AuthorizeAsync(GraphUserId viewerId, GraphUserId ownerId,
        CancellationToken token)
    {
        var profile = await profiles.FindByOwnerIdAsync(ownerId.Value, token);
        if (profile is null)
            return Result.Failure<ProfileLookup>("social_graph.not_found", "Profil bulunamadı.");
        if (viewerId == ownerId) return Result.Success(profile);
        var direct = await relationships.SelectAsync(x => x.ActorId == viewerId && x.TargetId == ownerId, token);
        var reverse = await relationships.SelectAsync(x => x.ActorId == ownerId && x.TargetId == viewerId, token);
        if (direct?.IsBlocked == true || reverse?.IsBlocked == true ||
            profile.IsPrivate && direct?.FollowState != FollowState.Following)
            return Result.Failure<ProfileLookup>("social_graph.not_visible", "Bu profil ağı sana açık değil.");
        return Result.Success(profile);
    }

    private async Task<IReadOnlySet<Guid>> VisibleProfileIdsAsync(GraphUserId viewerId,
        IReadOnlyDictionary<Guid, ProfileLookup> profileMap, CancellationToken token)
    {
        if (profileMap.Count == 0) return new HashSet<Guid>();
        var candidates = profileMap.Keys.Select(id => new GraphUserId(id)).ToHashSet();
        var edges = await relationships.ListByFilterAsync(x =>
                x.ActorId == viewerId && candidates.Contains(x.TargetId) ||
                candidates.Contains(x.ActorId) && x.TargetId == viewerId,
            new QueryOptions<Relationship>(100), token);
        var blocked = edges.Where(x => x.IsBlocked).Select(x => x.ActorId == viewerId ? x.TargetId.Value : x.ActorId.Value).ToHashSet();
        var followed = edges.Where(x => x.ActorId == viewerId && x.FollowState == FollowState.Following)
            .Select(x => x.TargetId.Value).ToHashSet();
        return profileMap.Values.Where(profile => !blocked.Contains(profile.OwnerId) &&
                (!profile.IsPrivate || profile.OwnerId == viewerId.Value || followed.Contains(profile.OwnerId)))
            .Select(profile => profile.OwnerId).ToHashSet();
    }

    private static int DecodeCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return 0;
        try
        {
            var value = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            return int.TryParse(value, out var offset) && offset is >= 0 and <= MaxCursorOffset ? offset
                : throw new FormatException();
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException)
        {
            throw new DomainRuleException("social_graph.cursor_invalid", "Sayfalama imleci geçersiz.");
        }
    }

    private static string EncodeCursor(int offset) => Convert.ToBase64String(
        System.Text.Encoding.UTF8.GetBytes(offset.ToString(System.Globalization.CultureInfo.InvariantCulture)));
}

public sealed class ChangeRelationshipHandler(IRelationshipRepository relationships, IClock clock)
{
    public async Task<Result<RelationshipView>> HandleAsync(GraphUserId actorId, GraphUserId targetId, RelationshipChange change, CancellationToken cancellationToken)
    {
        if (actorId == targetId)
            return Result.Failure<RelationshipView>("social_graph.self_relationship", "Kullanıcı kendisiyle ilişki kuramaz.");
        var relationship = await relationships.SelectAsync(x => x.ActorId == actorId && x.TargetId == targetId, cancellationToken);
        if (relationship is null)
        {
            relationship = Relationship.Create(RelationshipId.New(), actorId, targetId, clock.UtcNow);
            if (change is not RelationshipChange.Block and not RelationshipChange.Mute)
                return Result.Failure<RelationshipView>("social_graph.relationship_not_found", "İlişki bulunamadı.");
            Apply(relationship, change);
            await relationships.CreateAsync(relationship, cancellationToken);
        }
        else
        {
            var expectedVersion = relationship.Version;
            try { Apply(relationship, change); }
            catch (DomainRuleException exception) { return Result.Failure<RelationshipView>(exception.Code, exception.Message); }
            if (relationship.Version != expectedVersion && !await relationships.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion, cancellationToken))
                return Result.Failure<RelationshipView>("social_graph.concurrency_conflict", "İlişki eşzamanlı güncellendi.");
        }

        if (change == RelationshipChange.Block)
        {
            var reverse = await relationships.SelectAsync(x => x.ActorId == targetId && x.TargetId == actorId, cancellationToken);
            if (reverse is not null)
            {
                var reverseVersion = reverse.Version;
                reverse.Unfollow(clock.UtcNow);
                if (reverse.Version != reverseVersion)
                    await relationships.UpdateAsync(x => x.Id == reverse.Id, reverse, reverseVersion, cancellationToken);
            }
        }
        return Result.Success(FollowHandler.Map(relationship, false));
    }

    private void Apply(Relationship relationship, RelationshipChange change)
    {
        switch (change)
        {
            case RelationshipChange.Unfollow: relationship.Unfollow(clock.UtcNow); break;
            case RelationshipChange.Block: relationship.Block(clock.UtcNow); break;
            case RelationshipChange.Unblock: relationship.Unblock(clock.UtcNow); break;
            case RelationshipChange.Mute: relationship.SetMuted(true, clock.UtcNow); break;
            case RelationshipChange.Unmute: relationship.SetMuted(false, clock.UtcNow); break;
            case RelationshipChange.AddCloseFriend: relationship.SetCloseFriend(true, clock.UtcNow); break;
            case RelationshipChange.RemoveCloseFriend: relationship.SetCloseFriend(false, clock.UtcNow); break;
            default: throw new ArgumentOutOfRangeException(nameof(change));
        }
    }
}

public enum RelationshipChange { Unfollow, Block, Unblock, Mute, Unmute, AddCloseFriend, RemoveCloseFriend }

public sealed class GetRelationshipHandler(IRelationshipRepository relationships)
{
    public async Task<RelationshipView> HandleAsync(GraphUserId actorId, GraphUserId targetId, CancellationToken cancellationToken)
    {
        var direct = await relationships.SelectAsync(x => x.ActorId == actorId && x.TargetId == targetId, cancellationToken);
        var reverse = await relationships.SelectAsync(x => x.ActorId == targetId && x.TargetId == actorId, cancellationToken);
        return direct is null
            ? new(actorId.Value, targetId.Value, FollowState.None, false, reverse?.IsBlocked == true, false, false, 0)
            : FollowHandler.Map(direct, reverse?.IsBlocked == true);
    }
}
