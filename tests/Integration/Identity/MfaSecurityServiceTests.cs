using System.Buffers.Binary;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Security;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Identity;

public sealed class MfaSecurityServiceTests
{
    [Fact]
    public void EnrollmentTotpProtectionAndRecoveryCodesWorkTogether()
    {
        var service = new MfaSecurityService(new EphemeralDataProtectionProvider());
        var now = new DateTimeOffset(2026, 7, 12, 9, 0, 0, TimeSpan.Zero);
        var account = UserAccount.Register(UserId.New(), "mfatest", "mfa@example.test", "hash", now);
        var enrollment = service.Begin(account, now);
        Assert.True(service.TryReadEnrollment(enrollment.EnrollmentToken, out var payload));
        Assert.Equal(account.Id, payload.UserId);
        var code = ComputeTotp(enrollment.Secret, now.ToUnixTimeSeconds() / 30);
        Assert.True(service.ValidateSecret(enrollment.Secret, code, now));
        Assert.True(service.ValidateProtectedSecret(service.ProtectSecret(enrollment.Secret), code, now));
        var recoveryCodes = service.GenerateRecoveryCodes();
        Assert.Equal(10, recoveryCodes.Count);
        Assert.Equal(10, recoveryCodes.Select(service.HashRecoveryCode).Distinct().Count());
    }

    private static string ComputeTotp(string secret, long counter)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new List<byte>();
        var buffer = 0;
        var bits = 0;
        foreach (var character in secret)
        {
            buffer = (buffer << 5) | alphabet.IndexOf(character, StringComparison.Ordinal);
            bits += 5;
            if (bits >= 8) { bits -= 8; output.Add((byte)(buffer >> bits)); buffer &= (1 << bits) - 1; }
        }
        Span<byte> input = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(input, counter);
        var hash = HMACSHA256.HashData(output.ToArray(), input);
        var offset = hash[^1] & 15;
        var binary = ((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }
}
