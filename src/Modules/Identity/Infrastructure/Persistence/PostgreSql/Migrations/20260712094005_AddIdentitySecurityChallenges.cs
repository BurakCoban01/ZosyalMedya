using System;
using Microsoft.EntityFrameworkCore.Migrations;

#pragma warning disable CA1861 // EF Core tarafından üretilen sabit migration kolon dizileri.

#nullable disable

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentitySecurityChallenges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "security_challenges",
                schema: "identity",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_security_challenges", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_security_challenges_TokenHash_Purpose",
                schema: "identity",
                table: "security_challenges",
                columns: new[] { "TokenHash", "Purpose" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_security_challenges_UserId_Purpose_ExpiresAtUtc",
                schema: "identity",
                table: "security_challenges",
                columns: new[] { "UserId", "Purpose", "ExpiresAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "security_challenges",
                schema: "identity");
        }
    }
}
#pragma warning restore CA1861
