using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Application.Security;

namespace ZosyalMedya.Modules.Identity.Application.Users.Register;

public sealed record RegisterUserCommand(string Username, string Email, string Password);
public sealed record RegisterUserResult(Guid UserId, string Username, string Email);

public sealed class RegisterUserHandler(
    IUserAccountRepository repository,
    IPasswordHasher passwordHasher,
    IdentitySecurityFlows securityFlows,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock)
{
    public async Task<Result<RegisterUserResult>> HandleAsync(
        RegisterUserCommand command,
        CancellationToken cancellationToken)
    {
        if (command.Password.Length < 12)
            return Result.Failure<RegisterUserResult>("identity.password_weak", "Parola en az 12 karakter olmalıdır.");

        var username = command.Username.Trim();
        var email = command.Email.Trim();
        if (publicDemo.Enabled && !publicDemo.IsVisitorEmail(email))
            return Result.Failure<RegisterUserResult>("identity.demo_email_required", $"Genel demoda yalnızca geçici @{publicDemo.VisitorEmailDomain} adresleri kullanılabilir.");
        var normalizedUsername = username.ToUpperInvariant();
        var normalizedEmail = email.ToUpperInvariant();
#pragma warning disable CA1862 // Sağlayıcıların çevirebildiği normalize edilmiş kolon eşitliği kasıtlıdır.
        var existing = await repository.ListByFilterAsync(
            x => x.NormalizedUsername == normalizedUsername || x.NormalizedEmail == normalizedEmail,
            new(Limit: 2), cancellationToken);
#pragma warning restore CA1862
        if (existing.Any(x => string.Equals(x.NormalizedUsername, normalizedUsername, StringComparison.Ordinal)))
            return Result.Failure<RegisterUserResult>("identity.username_conflict", "Kullanıcı adı kullanılıyor.");
        if (existing.Any(x => string.Equals(x.NormalizedEmail, normalizedEmail, StringComparison.Ordinal)))
            return Result.Failure<RegisterUserResult>("identity.email_conflict", "E-posta adresi kullanılıyor.");

        var account = UserAccount.Register(UserId.New(), username, email, passwordHasher.Hash(command.Password), clock.UtcNow);
        try
        {
            await repository.CreateAsync(account, cancellationToken);
        }
        catch (ZosyalMedya.BuildingBlocks.Application.Persistence.PersistenceConflictException)
        {
            return Result.Failure<RegisterUserResult>("identity.unique_conflict", "Kullanıcı adı veya e-posta kullanılıyor.");
        }
        await securityFlows.SendVerificationAsync(account.Email, cancellationToken);
        return Result.Success(new RegisterUserResult(account.Id.Value, account.Username, account.Email));
    }
}
