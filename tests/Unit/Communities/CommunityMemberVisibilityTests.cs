using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Communities.Application.Communities;
using ZosyalMedya.Modules.Communities.Application.Ports;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using ZosyalMedya.Modules.Profiles.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Communities;

public sealed class CommunityMemberVisibilityTests
{
    [Fact]
    public async Task OnlyModeratorsCanListPendingMembersWithProfileSummaries()
    {
        var owner = Guid.NewGuid();
        var candidate = Guid.NewGuid();
        var stranger = Guid.NewGuid();
        var now = new DateTimeOffset(2026, 8, 14, 10, 0, 0, TimeSpan.Zero);
        var community = Community.Create(CommunityId.New(), new(owner), "urun-ekibi", "Ürün Ekibi", "Birlikte üretim", CommunityVisibility.Private, now);
        community.RequestMembership(new(candidate), now.AddMinutes(1));
        var handler = new ListCommunityMembersHandler(new Repository(community), new Profiles(candidate));

        var allowed = await handler.HandleAsync(community.Id.Value, owner, MembershipStatus.Pending, 50, default);
        var denied = await handler.HandleAsync(community.Id.Value, stranger, MembershipStatus.Pending, 50, default);

        Assert.True(allowed.IsSuccess);
        var member = Assert.Single(allowed.Value!);
        Assert.Equal(candidate, member.UserId);
        Assert.Equal("aday", member.Handle);
        Assert.Equal("Pending", member.Status);
        Assert.False(denied.IsSuccess);
        Assert.Equal("communities.members_forbidden", denied.Error.Code);
    }

    private sealed class Repository(Community community) : ICommunityRepository
    {
        public Task<Community?> SelectAsync(Expression<Func<Community, bool>> predicate, CancellationToken cancellationToken = default) =>
            Task.FromResult(predicate.Compile()(community) ? community : null);
        public Task<IReadOnlyList<Community>> ListByFilterAsync(Expression<Func<Community, bool>> predicate, QueryOptions<Community>? options = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<CommunityId> CreateAsync(Community entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Community, bool>> predicate, Community replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Community, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class Profiles(Guid candidate) : IProfilesModule
    {
        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, ProfileLookup>>(new Dictionary<Guid, ProfileLookup>
            {
                [candidate] = new(candidate, "aday", "Aday Üye", false, null, false)
            });
    }
}
