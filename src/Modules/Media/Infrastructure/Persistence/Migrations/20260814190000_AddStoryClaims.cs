using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZosyalMedya.Modules.Media.Infrastructure.Persistence.Migrations;

[DbContext(typeof(MediaDbContext))]
[Migration("20260814190000_AddStoryClaims")]
public partial class AddStoryClaims : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "StoryClaimExpiresAtUtc",
            schema: "media",
            table: "assets",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<Guid>(
            name: "StoryClaimId",
            schema: "media",
            table: "assets",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_assets_StoryClaimId",
            schema: "media",
            table: "assets",
            column: "StoryClaimId",
            filter: "\"StoryClaimId\" IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_assets_StoryClaimId", schema: "media", table: "assets");
        migrationBuilder.DropColumn(name: "StoryClaimExpiresAtUtc", schema: "media", table: "assets");
        migrationBuilder.DropColumn(name: "StoryClaimId", schema: "media", table: "assets");
    }
}
