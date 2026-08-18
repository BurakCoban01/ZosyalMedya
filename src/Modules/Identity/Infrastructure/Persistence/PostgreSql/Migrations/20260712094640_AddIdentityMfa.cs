using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentityMfa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "MfaEnabled",
                schema: "identity",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string[]>(
                name: "MfaRecoveryCodeHashes",
                schema: "identity",
                table: "users",
                type: "text[]",
                nullable: false,
                defaultValue: Array.Empty<string>());

            migrationBuilder.AddColumn<string>(
                name: "ProtectedMfaSecret",
                schema: "identity",
                table: "users",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MfaEnabled",
                schema: "identity",
                table: "users");

            migrationBuilder.DropColumn(
                name: "MfaRecoveryCodeHashes",
                schema: "identity",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ProtectedMfaSecret",
                schema: "identity",
                table: "users");
        }
    }
}
