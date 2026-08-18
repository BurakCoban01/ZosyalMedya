using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core tarafından üretilen compound-index kolon dizileri.

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialSocialGraph : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "social_graph");

            migrationBuilder.CreateTable(
                name: "relationships",
                schema: "social_graph",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    FollowState = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    IsBlocked = table.Column<bool>(type: "boolean", nullable: false),
                    IsMuted = table.Column<bool>(type: "boolean", nullable: false),
                    IsCloseFriend = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_relationships", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_relationships_ActorId_TargetId",
                schema: "social_graph",
                table: "relationships",
                columns: new[] { "ActorId", "TargetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_relationships_TargetId_FollowState",
                schema: "social_graph",
                table: "relationships",
                columns: new[] { "TargetId", "FollowState" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "relationships",
                schema: "social_graph");
        }
    }
}
