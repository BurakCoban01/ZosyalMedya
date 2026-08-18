using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

namespace ZosyalMedya.Modules.Reactions.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialReactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "reactions");

            migrationBuilder.CreateTable(
                name: "reactions",
                schema: "reactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reactions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_reactions_ActorId_ContentId",
                schema: "reactions",
                table: "reactions",
                columns: new[] { "ActorId", "ContentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reactions_ContentId_IsActive_Kind",
                schema: "reactions",
                table: "reactions",
                columns: new[] { "ContentId", "IsActive", "Kind" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reactions",
                schema: "reactions");
        }
    }
}
#pragma warning restore CA1861
