using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core tarafından üretilen sabit migration kolon dizileri.

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                schema: "notifications",
                table: "inbox",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_inbox_RecipientId_IdempotencyKey",
                schema: "notifications",
                table: "inbox",
                columns: new[] { "RecipientId", "IdempotencyKey" },
                unique: true,
                filter: "\"IdempotencyKey\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_inbox_RecipientId_IdempotencyKey",
                schema: "notifications",
                table: "inbox");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                schema: "notifications",
                table: "inbox");
        }
    }
}
#pragma warning restore CA1861
