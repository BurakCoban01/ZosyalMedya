using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Profiles.Domain.Profiles;

public readonly record struct ProfileId(Guid Value)
{
    public static ProfileId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public readonly record struct ProfileOwnerId(Guid Value)
{
    public override string ToString() => Value.ToString("D");
}

public enum ProfileTheme { System, Light, Dark }
public enum ProfileLanguage { Turkish, English }

public sealed class Profile : AggregateRoot<ProfileId>
{
    private Profile() : base(default)
    {
        Handle = string.Empty;
        NormalizedHandle = string.Empty;
        DisplayName = string.Empty;
        Biography = string.Empty;
        Location = string.Empty;
        Organization = string.Empty;
    }

    private Profile(ProfileId id, ProfileOwnerId ownerId, string handle, string displayName, DateTimeOffset now) : base(id)
    {
        OwnerId = ownerId;
        Handle = handle;
        NormalizedHandle = handle.ToUpperInvariant();
        DisplayName = displayName;
        Biography = string.Empty;
        Location = string.Empty;
        Organization = string.Empty;
        CreatedAtUtc = now;
        UpdatedAtUtc = now;
        Version = 1;
    }

    public ProfileOwnerId OwnerId { get; private set; }
    public string Handle { get; private set; }
    public string NormalizedHandle { get; private set; }
    public string DisplayName { get; private set; }
    public string Biography { get; private set; }
    public string Location { get; private set; }
    public string Organization { get; private set; }
    public string? WebsiteUrl { get; private set; }
    public Guid? ProfileMediaId { get; private set; }
    public Guid? CoverMediaId { get; private set; }
    public bool IsPrivate { get; private set; }
    public bool IsVerified { get; private set; }
    public ProfileTheme Theme { get; private set; } = ProfileTheme.System;
    public ProfileLanguage Language { get; private set; } = ProfileLanguage.Turkish;
    public bool ReduceMotion { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public int CompletenessPercentage
    {
        get
        {
            var completed = 2;
            if (!string.IsNullOrWhiteSpace(Biography)) completed++;
            if (!string.IsNullOrWhiteSpace(Location)) completed++;
            if (!string.IsNullOrWhiteSpace(Organization)) completed++;
            if (WebsiteUrl is not null) completed++;
            if (ProfileMediaId.HasValue) completed++;
            if (CoverMediaId.HasValue) completed++;
            return completed * 100 / 8;
        }
    }

    public static Profile Create(ProfileId id, ProfileOwnerId ownerId, string handle, string displayName, DateTimeOffset now)
    {
        var cleanHandle = ValidateHandle(handle);
        return new Profile(id, ownerId, cleanHandle, ValidateDisplayName(displayName), now);
    }

    public void Update(
        string handle,
        string displayName,
        string? biography,
        string? location,
        string? organization,
        string? websiteUrl,
        Guid? profileMediaId,
        Guid? coverMediaId,
        bool isPrivate,
        ProfileTheme theme,
        ProfileLanguage language,
        bool reduceMotion,
        DateTimeOffset now)
    {
        var cleanHandle = ValidateHandle(handle);
        Handle = cleanHandle;
        NormalizedHandle = cleanHandle.ToUpperInvariant();
        DisplayName = ValidateDisplayName(displayName);
        Biography = Limit(biography, 500);
        Location = Limit(location, 120);
        Organization = Limit(organization, 160);
        WebsiteUrl = ValidateWebsite(websiteUrl);
        ProfileMediaId = profileMediaId;
        CoverMediaId = coverMediaId;
        IsPrivate = isPrivate;
        Theme = theme;
        Language = language;
        ReduceMotion = reduceMotion;
        UpdatedAtUtc = now;
        Version++;
    }

    private static string ValidateHandle(string value)
    {
        var clean = value.Trim();
        if (clean.Length is < 3 or > 30 || clean.Any(character => !char.IsLetterOrDigit(character) && character is not '_' and not '.'))
            throw new DomainRuleException("profiles.handle_invalid", "Profil kullanıcı adı 3-30 karakter olmalı ve yalnızca harf, rakam, nokta veya alt çizgi içermelidir.");
        return clean;
    }

    private static string ValidateDisplayName(string value)
    {
        var clean = value.Trim();
        if (clean.Length is < 1 or > 80)
            throw new DomainRuleException("profiles.display_name_invalid", "Görünen ad 1-80 karakter olmalıdır.");
        return clean;
    }

    private static string Limit(string? value, int maximum) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim()[..Math.Min(value.Trim().Length, maximum)];

    private static string? ValidateWebsite(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new DomainRuleException("profiles.website_invalid", "Web sitesi mutlak bir HTTPS adresi olmalıdır.");
        return uri.AbsoluteUri;
    }
}
