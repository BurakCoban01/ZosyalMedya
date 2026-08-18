using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.Media.Contracts;

namespace ZosyalMedya.Modules.Profiles.Application.Profiles;

public sealed record UpdateMyProfileCommand(
    ProfileOwnerId OwnerId,
    string Handle,
    string DisplayName,
    string? Biography,
    string? Location,
    string? Organization,
    string? WebsiteUrl,
    Guid? ProfileMediaId,
    Guid? CoverMediaId,
    bool IsPrivate,
    ProfileTheme Theme,
    ProfileLanguage Language,
    bool ReduceMotion);

public sealed record ProfileView(
    Guid Id,
    Guid OwnerId,
    string Handle,
    string DisplayName,
    string Biography,
    string Location,
    string Organization,
    string? WebsiteUrl,
    Guid? ProfileMediaId,
    Guid? CoverMediaId,
    bool IsPrivate,
    bool IsVerified,
    ProfileTheme Theme,
    ProfileLanguage Language,
    bool ReduceMotion,
    int CompletenessPercentage,
    long Version);

public sealed class UpdateMyProfileHandler(IProfileRepository profiles, IClock clock, ISearchModule search, IMediaModule media)
{
    public async Task<Result<ProfileView>> HandleAsync(UpdateMyProfileCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Handle) || string.IsNullOrWhiteSpace(command.DisplayName))
            return Result.Failure<ProfileView>("profiles.input_invalid", "Profil kullanıcı adı ve görünen ad gereklidir.");
        var mediaValidation = await ValidateMediaAsync(command, cancellationToken);
        if (!mediaValidation.IsSuccess) return Result.Failure<ProfileView>(mediaValidation.Error.Code, mediaValidation.Error.Message);
        var normalizedHandle = command.Handle.Trim().ToUpperInvariant();
        var conflict = await profiles.SelectAsync(
            x => x.NormalizedHandle == normalizedHandle && x.OwnerId != command.OwnerId,
            cancellationToken);
        if (conflict is not null)
            return Result.Failure<ProfileView>("profiles.handle_conflict", "Profil kullanıcı adı kullanılıyor.");

        Profile profile;
        try
        {
            profile = await profiles.SelectAsync(x => x.OwnerId == command.OwnerId, cancellationToken)
                ?? Profile.Create(ProfileId.New(), command.OwnerId, command.Handle, command.DisplayName, clock.UtcNow);
            if (profile.Version == 1 && profile.UpdatedAtUtc == profile.CreatedAtUtc)
            {
                profile.Update(command.Handle, command.DisplayName, command.Biography, command.Location, command.Organization, command.WebsiteUrl,
                    command.ProfileMediaId, command.CoverMediaId, command.IsPrivate, command.Theme, command.Language, command.ReduceMotion, clock.UtcNow);
                try
                {
                    await profiles.CreateAsync(profile, cancellationToken);
                }
                catch (ZosyalMedya.BuildingBlocks.Application.Persistence.PersistenceConflictException)
                {
                    return Result.Failure<ProfileView>("profiles.handle_conflict", "Profil kullanıcı adı kullanılıyor.");
                }
            }
            else
            {
                var expectedVersion = profile.Version;
                profile.Update(command.Handle, command.DisplayName, command.Biography, command.Location, command.Organization, command.WebsiteUrl,
                    command.ProfileMediaId, command.CoverMediaId, command.IsPrivate, command.Theme, command.Language, command.ReduceMotion, clock.UtcNow);
                if (!await profiles.UpdateAsync(x => x.Id == profile.Id, profile, expectedVersion, cancellationToken))
                    return Result.Failure<ProfileView>("profiles.concurrency_conflict", "Profil eşzamanlı güncellendi.");
            }
        }
        catch (DomainRuleException exception)
        {
            return Result.Failure<ProfileView>(exception.Code, exception.Message);
        }
        await search.IndexAsync(new SearchDocumentContract(profile.Id.Value, SearchDocumentType.Profile,
            profile.OwnerId.Value, profile.DisplayName, $"@{profile.Handle} {profile.Biography} {profile.Location} {profile.Organization}",
            string.IsNullOrWhiteSpace(profile.Organization) ? [] : [profile.Organization],
            profile.IsPrivate ? SearchVisibility.Private : SearchVisibility.Public, false, $"/profil/{profile.Handle}",
            profile.UpdatedAtUtc, profile.Version), cancellationToken);
        return Result.Success(Map(profile));
    }

    private async Task<Result<bool>> ValidateMediaAsync(UpdateMyProfileCommand command, CancellationToken cancellationToken)
    {
        var expectedVisibility = command.IsPrivate ? "Followers" : "Public";
        foreach (var mediaId in new[] { command.ProfileMediaId, command.CoverMediaId }.OfType<Guid>().Distinct())
        {
            var access = await media.GetAuthorizedAsync(mediaId, command.OwnerId.Value, cancellationToken);
            if (access is null || access.OwnerId != command.OwnerId.Value || access.Status != "Ready" ||
                !access.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return Result.Failure<bool>("profiles.media_invalid", "Profil medyası sana ait, hazır bir görsel olmalıdır.");
            if (!string.Equals(access.Visibility, expectedVisibility, StringComparison.Ordinal))
                return Result.Failure<bool>("profiles.media_visibility_mismatch", "Profil medyası profil görünürlüğüyle aynı kitleye açık olmalıdır.");
        }
        return Result.Success(true);
    }

    internal static ProfileView Map(Profile profile) => new(
        profile.Id.Value, profile.OwnerId.Value, profile.Handle, profile.DisplayName, profile.Biography, profile.Location,
        profile.Organization, profile.WebsiteUrl, profile.ProfileMediaId, profile.CoverMediaId, profile.IsPrivate,
        profile.IsVerified, profile.Theme, profile.Language, profile.ReduceMotion, profile.CompletenessPercentage, profile.Version);
}

public sealed class GetProfileHandler(IProfileRepository profiles, ISocialGraphModule graph)
{
    public async Task<Result<ProfileView>> ByHandleAsync(string handle, ProfileOwnerId? viewerId, CancellationToken cancellationToken)
    {
        var normalized = handle.Trim().ToUpperInvariant();
        var profile = await profiles.SelectAsync(x => x.NormalizedHandle == normalized, cancellationToken);
        if (profile is null)
            return Result.Failure<ProfileView>("profiles.not_found", "Profil bulunamadı.");
        RelationshipLookup? relationship = null;
        if (viewerId.HasValue && viewerId.Value != profile.OwnerId)
        {
            relationship = await graph.GetAsync(viewerId.Value.Value, profile.OwnerId.Value, cancellationToken);
            if (relationship.IsBlocked || relationship.IsBlockedByTarget)
                return Result.Failure<ProfileView>("profiles.not_visible", "Bu profil görünür değildir.");
        }
        if (profile.IsPrivate && viewerId != profile.OwnerId && relationship?.IsFollowing != true)
            return Result.Failure<ProfileView>("profiles.not_visible", "Bu profil gizlidir.");
        return Result.Success(UpdateMyProfileHandler.Map(profile));
    }

    public async Task<Result<ProfileView>> MineAsync(ProfileOwnerId ownerId, CancellationToken cancellationToken)
    {
        var profile = await profiles.SelectAsync(x => x.OwnerId == ownerId, cancellationToken);
        return profile is null
            ? Result.Failure<ProfileView>("profiles.not_found", "Profil henüz oluşturulmadı.")
            : Result.Success(UpdateMyProfileHandler.Map(profile));
    }
}

public sealed class ProfilesModule(IProfileRepository profiles) : IProfilesModule
{
    public async Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var profile = await profiles.SelectAsync(x => x.OwnerId == new ProfileOwnerId(ownerId), cancellationToken);
        return profile is null ? null : MapLookup(profile);
    }

    public async Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(
        IReadOnlySet<Guid> ownerIds,
        CancellationToken cancellationToken = default)
    {
        if (ownerIds.Count == 0) return new Dictionary<Guid, ProfileLookup>();

        var boundedIds = ownerIds.Take(100).Select(id => new ProfileOwnerId(id)).ToArray();
        var matches = await profiles.ListByFilterAsync(
            profile => boundedIds.Contains(profile.OwnerId),
            new(Limit: boundedIds.Length),
            cancellationToken);

        return matches.ToDictionary(profile => profile.OwnerId.Value, MapLookup);
    }

    private static ProfileLookup MapLookup(Profile profile) => new(
        profile.OwnerId.Value,
        profile.Handle,
        profile.DisplayName,
        profile.IsPrivate,
        profile.ProfileMediaId,
        profile.IsVerified);
}
