using Xunit;

namespace ZosyalMedya.Tests.Contract;

public sealed class DemoFixtureContractTests
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
    private static readonly string FixtureRoot = Path.Combine(Root, "scripts/fixtures/media");

    [Fact]
    public void MediaFixturesAreSmallRealFilesTrackedByTheSeedFlow()
    {
        string[] jpegFiles =
        [
            "emre-avatar.jpg", "ayse-avatar.jpg", "mehmet-avatar.jpg", "zeynep-avatar.jpg",
            "can-avatar.jpg", "elif-avatar.jpg", "burak-avatar.jpg", "deniz-avatar.jpg",
            "merve-avatar.jpg", "istanbul-workspace.jpg", "data-studio.jpg",
            "izmir-workspace.jpg", "writer-cafe.jpg", "research-library.jpg"
        ];

        foreach (var fileName in jpegFiles)
        {
            var path = Path.Combine(FixtureRoot, fileName);
            var bytes = File.ReadAllBytes(path);
            Assert.InRange(bytes.Length, 1, 250_000);
            Assert.Equal(0xff, bytes[0]);
            Assert.Equal(0xd8, bytes[1]);
            var metadataProbe = System.Text.Encoding.ASCII.GetString(bytes);
            Assert.DoesNotContain("Exif", metadataProbe, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("http://ns.adobe.com/xap", metadataProbe, StringComparison.OrdinalIgnoreCase);
        }

        var video = File.ReadAllBytes(Path.Combine(FixtureRoot, "data-studio-motion.mp4"));
        Assert.InRange(video.Length, 1, 250_000);
        Assert.Equal("ftyp", System.Text.Encoding.ASCII.GetString(video, 4, 4));

        var loader = File.ReadAllText(Path.Combine(Root, "scripts/seed-demo-media.ps1"));
        foreach (var fileName in jpegFiles.Append("data-studio-motion.mp4"))
            Assert.Contains(fileName, loader, StringComparison.Ordinal);

        Assert.Contains("/api/v1/media", loader, StringComparison.Ordinal);
        Assert.Contains("[System.Text.Encoding]::UTF8.GetBytes", loader, StringComparison.Ordinal);
        Assert.Contains("Remove-DemoMedia", loader, StringComparison.Ordinal);
        Assert.Contains("nextCursor", loader, StringComparison.Ordinal);
        Assert.Contains("Get-DemoPagedItems", loader, StringComparison.Ordinal);
        Assert.Contains("/api/v1/stories/", loader, StringComparison.Ordinal);
        Assert.Contains("Set-DemoStories -Username 'emrekaraca'", loader, StringComparison.Ordinal);
        Assert.Contains("Set-DemoStories -Username 'ayseyilmaz'", loader, StringComparison.Ordinal);
        Assert.Contains("Set-DemoStories -Username 'zeynepkaya'", loader, StringComparison.Ordinal);
        Assert.Contains("İstanbul’dan günaydın", loader, StringComparison.Ordinal);
        Assert.Contains("Yeni yazı için notlar", loader, StringComparison.Ordinal);
        Assert.Contains("LIKE '[V5-DEMO-STORY-EXPIRED]%'", loader, StringComparison.Ordinal);
        Assert.Contains("\"OwnerId\"='$($profile.ownerId)'", loader, StringComparison.Ordinal);
        Assert.Contains("StoryClaimExpiresAtUtc", loader, StringComparison.Ordinal);
        Assert.Contains("PostgresContainer", loader, StringComparison.Ordinal);
        Assert.Contains("olası bağlı medya korundu", loader, StringComparison.Ordinal);

        foreach (var script in new[] { "dev-up.ps1", "seed-demo.ps1", "seed-demo-media.ps1" })
        {
            var bytes = File.ReadAllBytes(Path.Combine(Root, "scripts", script));
            Assert.True(bytes.AsSpan().StartsWith(new byte[] { 0xef, 0xbb, 0xbf }), $"{script} must be UTF-8 with BOM for Windows PowerShell 5.");
        }
    }

    [Fact]
    public void DemoSeedIsIdempotentAndDoesNotDeleteExistingProductData()
    {
        string[] sqlFiles = ["seed-demo-data.sql", "seed-demo-data-part2.sql", "seed-demo-data-part3.sql"];
        var sql = string.Join('\n', sqlFiles.Select(file => File.ReadAllText(Path.Combine(Root, "scripts", file))));

        Assert.DoesNotContain("DELETE FROM", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ON CONFLICT", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("DO NOTHING", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("'Pending'", sql, StringComparison.Ordinal);
        Assert.Contains("\"Depth\"", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("Demo!", sql, StringComparison.Ordinal);
        Assert.Contains("'emrekaraca'", sql, StringComparison.Ordinal);
        Assert.Contains("'ayseyilmaz'", sql, StringComparison.Ordinal);
        Assert.Contains("'mervearslan'", sql, StringComparison.Ordinal);
        Assert.Equal(2, CountOccurrences(sql, "WHERE identity.users.\"Id\" = EXCLUDED.\"Id\";"));
        Assert.Contains("RAISE EXCEPTION 'Fixture kullanıcı adı başka bir hesaba ait; paylaşılan hesap değiştirilmedi.'", sql, StringComparison.Ordinal);

        var publicDemoPolicy = File.ReadAllText(Path.Combine(Root,
            "src/Modules/Identity/Infrastructure/Security/PublicDemoIdentity.cs"));
        foreach (var fixtureId in new[]
        {
            "8c956dd6-2194-4d52-938a-dde1e5fd6264",
            "11000000-0000-4000-8000-000000000001",
            "11000000-0000-4000-8000-000000000002",
            "11000000-0000-4000-8000-000000000003",
            "11000000-0000-4000-8000-000000000004",
            "11000000-0000-4000-8000-000000000005",
            "11000000-0000-4000-8000-000000000006",
            "11000000-0000-4000-8000-000000000007",
            "11000000-0000-4000-8000-000000000008"
        })
        {
            Assert.Contains($"'{fixtureId}'", sql, StringComparison.OrdinalIgnoreCase);
            Assert.Contains($"Guid.Parse(\"{fixtureId}\")", publicDemoPolicy, StringComparison.Ordinal);
        }

        foreach (var owner in new[]
        {
            "src/Modules/Identity/Application/Security/IdentitySecurityFlows.cs",
            "src/Modules/Identity/Application/Users/Login/LoginUser.cs",
            "src/Modules/Identity/Application/Security/MfaFlows.cs",
            "src/Modules/Identity/Application/Privacy/ManagePrivacy.cs",
            "src/Modules/Identity/Application/Users/Administration/ManageAccounts.cs"
        })
        {
            Assert.Contains("IsProtectedIdentity", File.ReadAllText(Path.Combine(Root, owner)), StringComparison.Ordinal);
        }

        var messageAndNotificationSeed = File.ReadAllText(Path.Combine(Root, "scripts", "seed-demo-data-part3.sql"));
        Assert.DoesNotContain("UPDATE messaging.messages SET \"Text\"=CASE", messageAndNotificationSeed, StringComparison.Ordinal);
        Assert.DoesNotContain("UPDATE notifications.inbox\nSET \"Arguments\"=jsonb_set", messageAndNotificationSeed.Replace("\r\n", "\n"), StringComparison.Ordinal);

        var orchestrator = File.ReadAllText(Path.Combine(Root, "scripts/seed-demo.ps1"));
        Assert.Contains("seed-demo-data.sql", orchestrator, StringComparison.Ordinal);
        Assert.Contains("seed-demo-data-part2.sql", orchestrator, StringComparison.Ordinal);
        Assert.Contains("seed-demo-data-part3.sql", orchestrator, StringComparison.Ordinal);
        Assert.Contains("seed-demo-media.ps1", orchestrator, StringComparison.Ordinal);
        Assert.Contains("-PostgresContainer $PostgresContainer", orchestrator, StringComparison.Ordinal);
        Assert.Contains("-PostgresUser $PostgresUser", orchestrator, StringComparison.Ordinal);
        Assert.Contains("-PostgresDatabase $PostgresDatabase", orchestrator, StringComparison.Ordinal);
        Assert.Contains("psql -U $PostgresUser -d $PostgresDatabase", orchestrator, StringComparison.Ordinal);
        Assert.Contains("New-IdentityV3PasswordHash -PlainText $Password", orchestrator, StringComparison.Ordinal);
        Assert.Contains("--set=\"fixture_password_hash=$passwordHash\"", orchestrator, StringComparison.Ordinal);
        Assert.Contains(":'fixture_password_hash'", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("AQAAAAIAAYagAAAA", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("Demo!", orchestrator, StringComparison.Ordinal);

        var readme = File.ReadAllText(Path.Combine(Root, "README.md"));
        Assert.Contains("kullanıcı adı: `emrekaraca`", readme, StringComparison.Ordinal);
        Assert.DoesNotContain("kullanıcı adı: `demo_user`", readme, StringComparison.Ordinal);
    }

    private static int CountOccurrences(string value, string needle) =>
        (value.Length - value.Replace(needle, string.Empty, StringComparison.Ordinal).Length) / needle.Length;
}
