using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "notifications");

            migrationBuilder.CreateTable(
                name: "inbox",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    EntityId = table.Column<Guid>(type: "uuid", nullable: true),
                    AggregationKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    TitleTemplateKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BodyTemplateKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TemplateVersion = table.Column<int>(type: "integer", nullable: false),
                    Arguments = table.Column<string>(type: "jsonb", nullable: false),
                    DeepLink = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false),
                    ReadAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeliveryState = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    DeliveryAttempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inbox", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_inbox_DeliveryState_NextAttemptAtUtc",
                schema: "notifications",
                table: "inbox",
                columns: new[] { "DeliveryState", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_inbox_RecipientId_AggregationKey_ReadAtUtc",
                schema: "notifications",
                table: "inbox",
                columns: new[] { "RecipientId", "AggregationKey", "ReadAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_inbox_RecipientId_CreatedAtUtc",
                schema: "notifications",
                table: "inbox",
                columns: new[] { "RecipientId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbox",
                schema: "notifications");
        }
    }
}
#pragma warning restore CA1861
