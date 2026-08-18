using System;
using Microsoft.EntityFrameworkCore.Migrations;

#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

#nullable disable

namespace ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialStories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "stories");

            migrationBuilder.CreateTable(
                name: "stories",
                schema: "stories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Caption = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Audience = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stories", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_stories_MediaId",
                schema: "stories",
                table: "stories",
                column: "MediaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stories_OwnerId_Status_ExpiresAtUtc_CreatedAtUtc_Id",
                schema: "stories",
                table: "stories",
                columns: new[] { "OwnerId", "Status", "ExpiresAtUtc", "CreatedAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_stories_Status_ExpiresAtUtc_CreatedAtUtc_Id",
                schema: "stories",
                table: "stories",
                columns: new[] { "Status", "ExpiresAtUtc", "CreatedAtUtc", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stories",
                schema: "stories");
        }
    }
}

#pragma warning restore CA1861
