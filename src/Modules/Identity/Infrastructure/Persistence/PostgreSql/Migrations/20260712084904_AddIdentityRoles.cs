using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core migration metadata intentionally uses a constant array.

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentityRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "Roles",
                schema: "identity",
                table: "users",
                type: "text[]",
                nullable: false,
                defaultValue: Array.Empty<string>());
            migrationBuilder.Sql("UPDATE identity.users SET \"Roles\" = ARRAY['Member']::text[] WHERE cardinality(\"Roles\") = 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Roles",
                schema: "identity",
                table: "users");
        }
    }
}
#pragma warning restore CA1861
