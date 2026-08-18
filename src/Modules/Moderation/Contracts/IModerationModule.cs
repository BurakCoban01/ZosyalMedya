namespace ZosyalMedya.Modules.Moderation.Contracts;

public enum ModeratedSubjectType { User, Content, Question, Message, Community }
public enum ModerationCapability { Publish, Engage, Message, CreateCommunity }
public interface IModerationModule
{
    Task<bool> CanPerformAsync(Guid userId, ModerationCapability capability,
        CancellationToken cancellationToken = default);
    Task<bool> IsSubjectRemovedAsync(ModeratedSubjectType type, Guid subjectId,
        CancellationToken cancellationToken = default);
}
