using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Audit.Contracts;

namespace ZosyalMedya.Modules.Identity.Application.Users.Administration;

public sealed record AccountAdministrationView(Guid Id, string Username, string Email, string Status,
    IReadOnlyList<string> Roles, DateTimeOffset CreatedAtUtc, long Version);
public enum AccountAdministrationChange { GrantRole, RevokeRole, Suspend, Reactivate, Deactivate }

public sealed class ManageAccountsHandler(
    IUserAccountRepository users,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock,
    IAuditModule audit)
{
    public async Task<IReadOnlyList<AccountAdministrationView>> ListAsync(int limit, CancellationToken token)
    {
        var accounts = await users.ListByFilterAsync(_ => true,
            new QueryOptions<UserAccount>(Math.Clamp(limit, 1, 200), [new(x => x.CreatedAtUtc, SortDirection.Descending)]), token);
        return accounts.Select(Map).ToArray();
    }

    public async Task<Result<AccountAdministrationView>> ChangeAsync(Guid id, Guid actorId,
        AccountAdministrationChange change, AccountRole? role, string correlationId, CancellationToken token)
    {
        var account = await users.SelectAsync(x => x.Id == new UserId(id), token);
        if (account is null) return Result.Failure<AccountAdministrationView>("identity.user_not_found", "Kullanıcı bulunamadı.");
        if (publicDemo.IsProtectedIdentity(account.Id))
            return Result.Failure<AccountAdministrationView>("identity.demo_fixture_protected", "Sabit demo hesabı public demo modunda değiştirilemez.");
        if (id == actorId && (change is AccountAdministrationChange.Suspend or AccountAdministrationChange.Deactivate ||
            change == AccountAdministrationChange.RevokeRole && role == AccountRole.Administrator))
            return Result.Failure<AccountAdministrationView>("identity.self_lockout_forbidden", "Yönetici kendi erişimini kaldıramaz.");
        var version = account.Version;
        try
        {
            switch (change)
            {
                case AccountAdministrationChange.GrantRole: account.SetRole(role ?? AccountRole.Member, true, clock.UtcNow); break;
                case AccountAdministrationChange.RevokeRole: account.SetRole(role ?? AccountRole.Member, false, clock.UtcNow); break;
                case AccountAdministrationChange.Suspend: account.Suspend(clock.UtcNow); break;
                case AccountAdministrationChange.Reactivate: account.Reactivate(clock.UtcNow); break;
                case AccountAdministrationChange.Deactivate: account.Deactivate(clock.UtcNow); break;
            }
        }
        catch (DomainRuleException exception) { return Result.Failure<AccountAdministrationView>(exception.Code, exception.Message); }
        if (!await users.UpdateAsync(x => x.Id == account.Id, account, version, token))
            return Result.Failure<AccountAdministrationView>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi.");
        await audit.WriteAsync(new(actorId, $"identity.account.{change}", "UserAccount", id.ToString("D"),
            change is AccountAdministrationChange.Suspend or AccountAdministrationChange.Deactivate
                ? AuditSeverity.Critical : AuditSeverity.Warning,
            new Dictionary<string, string> { ["role"] = role?.ToString() ?? string.Empty, ["status"] = account.Status.ToString() },
            correlationId), token);
        return Result.Success(Map(account));
    }

    private static AccountAdministrationView Map(UserAccount account) => new(account.Id.Value, account.Username,
        account.Email, account.Status.ToString(), account.Roles.Select(x => x.ToString()).ToArray(), account.CreatedAtUtc,
        account.Version);
}
