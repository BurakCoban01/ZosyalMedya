namespace ZosyalMedya.Modules.Stories.Contracts;

public interface IStoriesModule
{
    Task<bool> CanViewMediaAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default);
}
