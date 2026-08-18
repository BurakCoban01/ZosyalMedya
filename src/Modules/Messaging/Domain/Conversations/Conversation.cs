using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Messaging.Domain.Conversations;

public readonly record struct ConversationId(Guid Value) { public static ConversationId New() => new(Guid.NewGuid()); }
public readonly record struct ConversationMemberId(Guid Value);
public enum ConversationKind { Direct, Group }
public enum ConversationRole { Owner, Administrator, Member }

public sealed class ConversationMember
{
    private ConversationMember() { }
    internal ConversationMember(ConversationMemberId userId, ConversationRole role, DateTimeOffset joinedAtUtc)
    { UserId = userId; Role = role; JoinedAtUtc = joinedAtUtc; }
    public ConversationMemberId UserId { get; private set; }
    public ConversationRole Role { get; private set; }
    public DateTimeOffset JoinedAtUtc { get; private set; }
    public DateTimeOffset? LeftAtUtc { get; private set; }
    public DateTimeOffset? MutedUntilUtc { get; private set; }
    public bool IsArchived { get; private set; }
    public bool IsPinned { get; private set; }
    public bool IsActive => !LeftAtUtc.HasValue;
    internal void Leave(DateTimeOffset now) => LeftAtUtc ??= now;
    internal void ChangeRole(ConversationRole role) => Role = role;
    internal void SetPreferences(bool archived, bool pinned, DateTimeOffset? mutedUntilUtc)
    { IsArchived = archived; IsPinned = pinned; MutedUntilUtc = mutedUntilUtc; }
}

public sealed class Conversation : AggregateRoot<ConversationId>
{
    private List<ConversationMember> _members = [];
    private Conversation() : base(default) { Title = string.Empty; }
    private Conversation(ConversationId id, ConversationKind kind, string title, IEnumerable<ConversationMemberId> members, DateTimeOffset now) : base(id)
    {
        Kind = kind; Title = title; CreatedAtUtc = now; UpdatedAtUtc = now; Version = 1;
        var distinct = members.Distinct().ToArray();
        if (kind == ConversationKind.Direct && distinct.Length != 2)
            throw new DomainRuleException("messaging.direct_member_count", "Doğrudan konuşmada tam iki üye olmalıdır.");
        if (kind == ConversationKind.Group && distinct.Length is < 2 or > 250)
            throw new DomainRuleException("messaging.group_member_count", "Grup konuşması 2-250 üye içermelidir.");
        for (var index = 0; index < distinct.Length; index++)
            _members.Add(new ConversationMember(distinct[index], index == 0 ? ConversationRole.Owner : ConversationRole.Member, now));
    }

    public ConversationKind Kind { get; private set; }
    public string Title { get; private set; }
    public IReadOnlyList<ConversationMember> Members => _members.AsReadOnly();
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Conversation CreateDirect(ConversationId id, ConversationMemberId creator, ConversationMemberId target, DateTimeOffset now)
    {
        if (creator.Value == Guid.Empty || target.Value == Guid.Empty || creator == target)
            throw new DomainRuleException("messaging.members_invalid", "Konuşma üyeleri geçersiz.");
        return new Conversation(id, ConversationKind.Direct, string.Empty, [creator, target], now);
    }

    public static Conversation CreateGroup(ConversationId id, ConversationMemberId creator, IEnumerable<ConversationMemberId> members, string title, DateTimeOffset now)
    {
        var normalized = NormalizeTitle(title);
        return new Conversation(id, ConversationKind.Group, normalized, new[] { creator }.Concat(members), now);
    }

    public bool HasActiveMember(ConversationMemberId userId) => _members.Any(x => x.UserId == userId && x.IsActive);
    public IReadOnlyList<ConversationMemberId> ActiveMemberIds() => _members.Where(x => x.IsActive).Select(x => x.UserId).ToArray();

    public void AddMember(ConversationMemberId actor, ConversationMemberId member, DateTimeOffset now)
    {
        EnsureGroupAdministrator(actor);
        if (_members.Count(x => x.IsActive) >= 250) throw new DomainRuleException("messaging.group_full", "Grup üye sınırına ulaştı.");
        var existing = _members.SingleOrDefault(x => x.UserId == member);
        if (existing?.IsActive == true) return;
        if (existing is not null) throw new DomainRuleException("messaging.rejoin_requires_invite", "Ayrılan üye yeni davet ile katılmalıdır.");
        _members.Add(new ConversationMember(member, ConversationRole.Member, now)); Touch(now);
    }

    public void RemoveMember(ConversationMemberId actor, ConversationMemberId member, DateTimeOffset now)
    {
        var target = RequireActive(member);
        if (actor != member) EnsureGroupAdministrator(actor);
        if (target.Role == ConversationRole.Owner && actor != member)
            throw new DomainRuleException("messaging.owner_remove_forbidden", "Konuşma sahibi çıkarılamaz.");
        target.Leave(now); Touch(now);
    }

    public void ChangeRole(ConversationMemberId actor, ConversationMemberId member, ConversationRole role, DateTimeOffset now)
    {
        var administrator = RequireActive(actor);
        if (Kind != ConversationKind.Group || administrator.Role != ConversationRole.Owner)
            throw new DomainRuleException("messaging.role_forbidden", "Rolü yalnız konuşma sahibi değiştirebilir.");
        if (role == ConversationRole.Owner) throw new DomainRuleException("messaging.owner_transfer_explicit", "Sahiplik için açık transfer akışı gerekir.");
        RequireActive(member).ChangeRole(role); Touch(now);
    }

    public void SetMemberPreferences(ConversationMemberId actor, bool archived, bool pinned, DateTimeOffset? mutedUntilUtc, DateTimeOffset now)
    { RequireActive(actor).SetPreferences(archived, pinned, mutedUntilUtc); Touch(now); }

    private void EnsureGroupAdministrator(ConversationMemberId actor)
    {
        var member = RequireActive(actor);
        if (Kind != ConversationKind.Group || member.Role is not (ConversationRole.Owner or ConversationRole.Administrator))
            throw new DomainRuleException("messaging.membership_forbidden", "Bu üyelik işlemi için yetki yok.");
    }
    private ConversationMember RequireActive(ConversationMemberId userId) =>
        _members.SingleOrDefault(x => x.UserId == userId && x.IsActive) ??
        throw new DomainRuleException("messaging.not_member", "Kullanıcı konuşmanın aktif üyesi değil.");
    private void Touch(DateTimeOffset now) { UpdatedAtUtc = now; Version++; }
    private static string NormalizeTitle(string title)
    {
        var value = title.Trim();
        if (value.Length is < 2 or > 100) throw new DomainRuleException("messaging.title_invalid", "Grup adı 2-100 karakter olmalıdır.");
        return value;
    }
}
