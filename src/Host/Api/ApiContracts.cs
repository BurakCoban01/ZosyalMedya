using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using ZosyalMedya.Modules.Communities.Application.Communities;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.Identity.Application.Users.Administration;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using ZosyalMedya.Modules.Moderation.Application.Cases;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Host.Api;

public sealed record RegisterRequest(string Username, string Email, string Password);
public sealed record EmailRequest(string Email);
public sealed record SecurityTokenRequest(string Token);
public sealed record PasswordResetRequest(string Token, string NewPassword);
public sealed record LoginRequest(string Login, string Password, string DeviceId, string DeviceName, string? MfaCode = null);
public sealed record BrowserLoginResult(Guid UserId, string Username, string AccessToken, DateTimeOffset AccessTokenExpiresAtUtc);
public sealed record BrowserAccessToken(string AccessToken, DateTimeOffset AccessTokenExpiresAtUtc);
public sealed record ConfirmMfaRequest(string EnrollmentToken, string Code);
public sealed record MfaCodeRequest(string Code);
public sealed record RefreshRequest(string RefreshToken);
public sealed record LogoutRequest(string RefreshToken);
public sealed record DeleteMyDataRequest(string CurrentPassword, string? MfaCode = null);
public sealed record UpdateProfileRequest(
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

public sealed record AskQuestionRequest(
    Guid TargetId,
    string Body,
    bool IsAnonymous,
    QuestionAudience Audience,
    bool IsDraft,
    DateTimeOffset? PublishAtUtc);

public sealed record AnswerQuestionRequest(string Answer);

public sealed record CreatePostRequest(string? Text, IReadOnlyList<Guid>? MediaIds, PostVisibility Visibility,
    ShareKind ShareKind, Guid? OriginalPostId, string? LinkUrl, string? ContentWarning, bool IsSensitive,
    bool IsDraft, DateTimeOffset? PublishAtUtc);
public sealed record UpdatePostRequest(string? Text, IReadOnlyList<Guid>? MediaIds, PostVisibility Visibility,
    string? LinkUrl, string? ContentWarning, bool IsSensitive, long ExpectedVersion);
public sealed record SetReactionRequest(ReactionKind Kind);
public sealed record CreateCommentRequest(string Text, Guid? ParentId);
public sealed record UpdateCommentRequest(string Text);
public sealed record CreateConversationRequest(IReadOnlyList<Guid> MemberIds, string? Title);
public sealed record SendMessageRequest(string Text, IReadOnlyList<Guid>? MediaIds, Guid? ReplyToId);
public sealed record CreatePollRequest(string Question, IReadOnlyList<string> Options, bool AllowMultiple, DateTimeOffset ClosesAtUtc);
public sealed record VotePollRequest(IReadOnlyList<Guid> OptionIds);
public sealed record SaveContentRequest(string? Collection);
public sealed record ChangeMessageRequest(MessageChange Change, string? Text);
public sealed record CreateCommunityRequest(string Slug,string Name,string Description,CommunityVisibility Visibility);
public sealed record ChangeCommunityRequest(CommunityChange Change,Guid? TargetId,string? Reason);
public sealed record SetCommunityRulesRequest(IReadOnlyList<string> Rules);

public sealed class SystemClock(TimeProvider timeProvider) : IClock
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();
}
public sealed record InitiateMediaRequest(string FileName, string ContentType, long Size, MediaVisibility Visibility);
public sealed record CreateStoryRequest(Guid MediaId, string? Caption, StoryAudience Audience);
public sealed record AccountAdministrationRequest(AccountAdministrationChange Change, AccountRole? Role);
public sealed record CreateModerationReportRequest(ModeratedSubjectType SubjectType, Guid SubjectId, ReportReason Reason,
    string Details, IReadOnlyList<string>? EvidenceReferences);
public sealed record TriageModerationReportRequest(Guid TargetUserId);
public sealed record ChangeModerationCaseRequest(ModerationCaseChange Change, Guid? AssigneeId, string Reason,
    EnforcementKind? Enforcement, DateTimeOffset? ExpiresAtUtc, bool? AppealAccepted);
public sealed record AppealModerationCaseRequest(string Text);
public sealed record SetFeatureFlagRequest(string Description, bool Enabled, int RolloutPercentage);
public sealed record SetSystemSettingRequest(string ValueJson, string Description);
