using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Security;

public sealed class MfaSecurityService(IDataProtectionProvider protectionProvider) : IMfaSecurityService
{
    private readonly IDataProtector secretProtector = protectionProvider.CreateProtector("identity.mfa.secret.v1");
    private readonly IDataProtector enrollmentProtector = protectionProvider.CreateProtector("identity.mfa.enrollment.v1");
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public PendingMfaEnrollment Begin(UserAccount account, DateTimeOffset now)
    {
        var secret = Base32Encode(RandomNumberGenerator.GetBytes(20));
        var payload = new MfaEnrollmentPayload(account.Id, secret, now.AddMinutes(10));
        var token = enrollmentProtector.Protect(JsonSerializer.Serialize(payload));
        const string issuer = "Enterprise Social & Community Platform";
        var uri = $"otpauth://totp/{Uri.EscapeDataString(issuer + ":" + account.Email)}?secret={secret}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA256&digits=6&period=30";
        return new PendingMfaEnrollment(secret, uri, token);
    }

    public bool TryReadEnrollment(string enrollmentToken, out MfaEnrollmentPayload payload)
    {
        payload = default!;
        try
        {
            payload = JsonSerializer.Deserialize<MfaEnrollmentPayload>(enrollmentProtector.Unprotect(enrollmentToken))!;
            return payload is not null;
        }
        catch (Exception exception) when (exception is CryptographicException or JsonException or ArgumentException)
        {
            return false;
        }
    }

    public bool ValidateSecret(string secret, string code, DateTimeOffset now)
    {
        if (code.Length != 6 || !code.All(char.IsAsciiDigit)) return false;
        byte[] key;
        try { key = Base32Decode(secret); }
        catch (FormatException) { return false; }
        var currentStep = now.ToUnixTimeSeconds() / 30;
        for (var offset = -1; offset <= 1; offset++)
        {
            var expected = ComputeTotp(key, currentStep + offset);
            if (CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(code)))
                return true;
        }
        return false;
    }

    public bool ValidateProtectedSecret(string protectedSecret, string code, DateTimeOffset now)
    {
        try { return ValidateSecret(secretProtector.Unprotect(protectedSecret), code, now); }
        catch (CryptographicException) { return false; }
    }

    public string ProtectSecret(string secret) => secretProtector.Protect(secret);

    public IReadOnlyList<string> GenerateRecoveryCodes() => Enumerable.Range(0, 10)
        .Select(_ => Convert.ToHexString(RandomNumberGenerator.GetBytes(6)))
        .ToArray();

    public string HashRecoveryCode(string code) => Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim().ToUpperInvariant())));

    private static string ComputeTotp(byte[] key, long counter)
    {
        Span<byte> input = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(input, counter);
        var hash = HMACSHA256.HashData(key, input);
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) |
                     (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string Base32Encode(ReadOnlySpan<byte> bytes)
    {
        var builder = new StringBuilder((bytes.Length * 8 + 4) / 5);
        var buffer = 0;
        var bits = 0;
        foreach (var value in bytes)
        {
            buffer = (buffer << 8) | value;
            bits += 8;
            while (bits >= 5) { bits -= 5; builder.Append(Alphabet[(buffer >> bits) & 31]); }
        }
        if (bits > 0) builder.Append(Alphabet[(buffer << (5 - bits)) & 31]);
        return builder.ToString();
    }

    private static byte[] Base32Decode(string value)
    {
        var output = new List<byte>(value.Length * 5 / 8);
        var buffer = 0;
        var bits = 0;
        foreach (var character in value.TrimEnd('=').ToUpperInvariant())
        {
            var index = Alphabet.IndexOf(character, StringComparison.Ordinal);
            if (index < 0) throw new FormatException("Geçersiz Base32 değeri.");
            buffer = (buffer << 5) | index;
            bits += 5;
            if (bits >= 8) { bits -= 8; output.Add((byte)(buffer >> bits)); buffer &= (1 << bits) - 1; }
        }
        return output.ToArray();
    }
}
