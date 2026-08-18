namespace ZosyalMedya.Modules.Profiles.Contracts;

public sealed record ProfileLookup(
    Guid OwnerId,
    string Handle,
    string DisplayName,
    bool IsPrivate,
    Guid? ProfileMediaId,
    bool IsVerified);

/// <summary>Diğer modüllerin Profiles veritabanına erişmeden kullanacağı public modül sözleşmesi.</summary>
public interface IProfilesModule
{
    Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(
        IReadOnlySet<Guid> ownerIds,
        CancellationToken cancellationToken = default);
}
