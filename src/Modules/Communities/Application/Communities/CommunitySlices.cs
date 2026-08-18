using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Communities.Application.Ports;
using ZosyalMedya.Modules.Communities.Contracts;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Search.Contracts;

namespace ZosyalMedya.Modules.Communities.Application.Communities;

public sealed record CommunityView(Guid Id, string Slug, string Name, string Description, string Visibility,
    string Status, IReadOnlyList<string> Rules, IReadOnlyList<Guid> PinnedContentIds,
    int ActiveMemberCount, string? ViewerMembershipStatus, string? ViewerRole, DateTimeOffset UpdatedAtUtc, long Version);
public sealed record CommunityDetailView(Guid Id, string Slug, string Name, string Description, string Visibility,
    IReadOnlyList<string> Rules, IReadOnlyList<Guid> PinnedContentIds, int ActiveMemberCount,
    string? ViewerMembershipStatus, string? ViewerRole, DateTimeOffset UpdatedAtUtc);
public sealed record CommunityMemberView(Guid UserId, string Handle, string DisplayName, Guid? ProfileMediaId,
    bool IsVerified, string Role, string Status, DateTimeOffset UpdatedAtUtc);

public sealed class CreateCommunityHandler(ICommunityRepository communities, IClock clock, ISearchModule search)
{
    public async Task<Result<CommunityView>> HandleAsync(Guid actor, string slug, string name, string description,
        CommunityVisibility visibility, CancellationToken token)
    {
        var normalizedSlug = slug.Trim().ToLowerInvariant();
        if (await communities.SelectAsync(x => x.Slug == normalizedSlug, token) is not null)
            return Result.Failure<CommunityView>("communities.slug_conflict", "Topluluk adresi kullanılıyor.");
        try
        {
            var item = Community.Create(CommunityId.New(), new(actor), slug, name, description, visibility, clock.UtcNow);
            await communities.CreateAsync(item, token);
            await CommunitySearchIndex.SyncAsync(search, item, token);
            return Result.Success(Map(item, actor));
        }
        catch (DomainRuleException exception) { return Result.Failure<CommunityView>(exception.Code, exception.Message); }
    }
    internal static CommunityView Map(Community item, Guid? viewerId)
    {
        var viewer = viewerId.HasValue
            ? item.Members.SingleOrDefault(x => x.UserId == new CommunityActorId(viewerId.Value))
            : null;
        return new(item.Id.Value, item.Slug, item.Name, item.Description,
        item.Visibility.ToString(), item.Status.ToString(), item.Rules.OrderBy(x => x.Order).Select(x => x.Text).ToArray(),
        item.PinnedContentIds, item.Members.Count(x => x.Status == MembershipStatus.Active), viewer?.Status.ToString(),
        viewer?.Status == MembershipStatus.Active ? viewer.Role.ToString() : null, item.UpdatedAtUtc, item.Version);
    }
}

public sealed class ListCommunitiesHandler(ICommunityRepository communities)
{
    public async Task<IReadOnlyList<CommunityView>> HandleAsync(Guid? actor, int limit, CancellationToken token)
    {
        var items = await communities.ListByFilterAsync(x => x.Status == CommunityStatus.Active &&
            (x.Visibility == CommunityVisibility.Public || actor.HasValue), new QueryOptions<Community>(Math.Clamp(limit, 1, 100),
            [new(x => x.UpdatedAtUtc, SortDirection.Descending)]), token);
        return items.Where(x => x.Visibility != CommunityVisibility.Hidden || actor.HasValue &&
            x.HasActiveMember(new(actor.Value))).Select(x => CreateCommunityHandler.Map(x, actor)).ToArray();
    }
}

public sealed class GetCommunityHandler(ICommunityRepository communities)
{
    public async Task<Result<CommunityDetailView>> HandleAsync(string slug, Guid? actor, CancellationToken token)
    {
        var normalizedSlug = slug.Trim().ToLowerInvariant();
        var item = await communities.SelectAsync(x => x.Slug == normalizedSlug, token);
        if (item is null || item.Status != CommunityStatus.Active)
            return Result.Failure<CommunityDetailView>("communities.not_found", "Topluluk bulunamadı.");

        var viewer = actor.HasValue
            ? item.Members.SingleOrDefault(x => x.UserId == new CommunityActorId(actor.Value))
            : null;
        if (item.Visibility == CommunityVisibility.Hidden && viewer?.Status != MembershipStatus.Active)
            return Result.Failure<CommunityDetailView>("communities.not_visible", "Bu topluluk sana açık değil.");

        return Result.Success(new CommunityDetailView(item.Id.Value, item.Slug, item.Name, item.Description,
            item.Visibility.ToString(), item.Rules.OrderBy(x => x.Order).Select(x => x.Text).ToArray(),
            item.PinnedContentIds, item.Members.Count(x => x.Status == MembershipStatus.Active),
            viewer?.Status.ToString(), viewer?.Status == MembershipStatus.Active ? viewer.Role.ToString() : null,
            item.UpdatedAtUtc));
    }
}

public sealed class ListCommunityMembersHandler(ICommunityRepository communities, IProfilesModule profiles)
{
    public async Task<Result<IReadOnlyList<CommunityMemberView>>> HandleAsync(Guid id, Guid actor,
        MembershipStatus? status, int limit, CancellationToken token)
    {
        var item = await communities.SelectAsync(x => x.Id == new CommunityId(id), token);
        if (item is null || item.Status != CommunityStatus.Active)
            return Result.Failure<IReadOnlyList<CommunityMemberView>>("communities.not_found", "Topluluk bulunamadı.");
        if (item.RoleOf(new(actor)) is not (CommunityRole.Owner or CommunityRole.Administrator or CommunityRole.Moderator))
            return Result.Failure<IReadOnlyList<CommunityMemberView>>("communities.members_forbidden", "Üye yönetimi için moderatör yetkisi gerekir.");
        var members = item.Members.Where(x => !status.HasValue || x.Status == status.Value)
            .OrderByDescending(x => x.UpdatedAtUtc).Take(Math.Clamp(limit, 1, 100)).ToArray();
        var ids = members.Select(x => x.UserId.Value).ToHashSet();
        var lookups = ids.Count == 0 ? new Dictionary<Guid, ProfileLookup>()
            : await profiles.FindByOwnerIdsAsync(ids, token);
        IReadOnlyList<CommunityMemberView> result = members.Select(member =>
        {
            var profile = lookups.GetValueOrDefault(member.UserId.Value);
            return new CommunityMemberView(member.UserId.Value, profile?.Handle ?? "", profile?.DisplayName ?? "Kullanıcı",
                profile?.ProfileMediaId, profile?.IsVerified ?? false, member.Role.ToString(), member.Status.ToString(), member.UpdatedAtUtc);
        }).ToArray();
        return Result.Success(result);
    }
}

public enum CommunityChange { RequestMembership, Leave, Invite, Approve, Archive }

public sealed class ChangeCommunityHandler(ICommunityRepository communities, IClock clock, ISearchModule search)
{
    public async Task<Result<CommunityView>> HandleAsync(Guid id, Guid actor, CommunityChange change, Guid? target,
        string? reason, CancellationToken token)
    {
        var item = await communities.SelectAsync(x => x.Id == new CommunityId(id), token);
        if (item is null) return Result.Failure<CommunityView>("communities.not_found", "Topluluk bulunamadı.");
        var version = item.Version;
        try
        {
            switch (change)
            {
                case CommunityChange.RequestMembership: item.RequestMembership(new(actor), clock.UtcNow); break;
                case CommunityChange.Leave: item.Leave(new(actor), clock.UtcNow); break;
                case CommunityChange.Invite: item.Invite(new(actor), new(target ?? Guid.Empty), clock.UtcNow); break;
                case CommunityChange.Approve: item.Approve(new(actor), new(target ?? Guid.Empty), clock.UtcNow); break;
                case CommunityChange.Archive: item.Archive(new(actor), reason ?? string.Empty, clock.UtcNow); break;
            }
        }
        catch (DomainRuleException exception) { return Result.Failure<CommunityView>(exception.Code, exception.Message); }
        if (item.Version != version && !await communities.UpdateAsync(x => x.Id == item.Id, item, version, token))
            return Result.Failure<CommunityView>("communities.concurrency_conflict", "Topluluk eşzamanlı güncellendi.");
        await CommunitySearchIndex.SyncAsync(search, item, token);
        return Result.Success(CreateCommunityHandler.Map(item, actor));
    }
}

public sealed class ConfigureCommunityHandler(ICommunityRepository communities, IClock clock, ISearchModule search)
{
    public Task<Result<CommunityView>> SetRulesAsync(Guid id, Guid actor, IReadOnlyList<string> rules, CancellationToken token) =>
        Change(id, actor, item => item.SetRules(new(actor), rules, clock.UtcNow), token);
    public Task<Result<CommunityView>> PinAsync(Guid id, Guid actor, Guid contentId, bool pinned, CancellationToken token) =>
        Change(id, actor, item => item.Pin(new(actor), contentId, pinned, clock.UtcNow), token);
    private async Task<Result<CommunityView>> Change(Guid id, Guid actor, Action<Community> change, CancellationToken token)
    {
        var item = await communities.SelectAsync(x => x.Id == new CommunityId(id), token);
        if (item is null) return Result.Failure<CommunityView>("communities.not_found", "Topluluk bulunamadı.");
        var version = item.Version;
        try { change(item); }
        catch (DomainRuleException exception) { return Result.Failure<CommunityView>(exception.Code, exception.Message); }
        if (!await communities.UpdateAsync(x => x.Id == item.Id, item, version, token))
            return Result.Failure<CommunityView>("communities.concurrency_conflict", "Topluluk eşzamanlı güncellendi.");
        await CommunitySearchIndex.SyncAsync(search, item, token);
        return Result.Success(CreateCommunityHandler.Map(item, actor));
    }
}

public sealed class CommunitiesModule(ICommunityRepository communities) : ICommunitiesModule
{
    public async Task<CommunityAccess> GetAccessAsync(Guid communityId, Guid? actorId,
        CancellationToken cancellationToken = default)
    {
        var item = await communities.SelectAsync(x => x.Id == new CommunityId(communityId), cancellationToken);
        if (item is null || item.Status != CommunityStatus.Active) return new(communityId, false, false, false, null);
        var role = actorId.HasValue ? item.RoleOf(new(actorId.Value)) : null;
        var view = item.Visibility == CommunityVisibility.Public || role.HasValue;
        return new(communityId, view, role.HasValue,
            role is CommunityRole.Owner or CommunityRole.Administrator or CommunityRole.Moderator, role?.ToString());
    }
}

internal static class CommunitySearchIndex
{
    public static Task SyncAsync(ISearchModule search, Community item, CancellationToken token)
    {
        if (item.Status != CommunityStatus.Active)
            return search.RemoveAsync(SearchDocumentType.Community, item.Id.Value, item.Version, token);
        var visibility = item.Visibility == CommunityVisibility.Public ? SearchVisibility.Public : SearchVisibility.Private;
        return search.IndexAsync(new SearchDocumentContract(item.Id.Value, SearchDocumentType.Community,
            item.Members.Single(x => x.Role == CommunityRole.Owner).UserId.Value, item.Name,
            $"{item.Description} {string.Join(' ', item.Rules.Select(x => x.Text))}", [], visibility, false,
            $"/topluluklar/{item.Slug}", item.UpdatedAtUtc, item.Version), token);
    }
}
