using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable
#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

namespace ZosyalMedya.Modules.Communities.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCommunities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "communities");

            migrationBuilder.CreateTable(
                name: "communities",
                schema: "communities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Visibility = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PinnedContentIds = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_communities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "audit",
                schema: "communities",
                columns: table => new
                {
                    Sequence = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CommunityId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit", x => new { x.CommunityId, x.Sequence });
                    table.ForeignKey(
                        name: "FK_audit_communities_CommunityId",
                        column: x => x.CommunityId,
                        principalSchema: "communities",
                        principalTable: "communities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "members",
                schema: "communities",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CommunityId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_members", x => new { x.CommunityId, x.UserId });
                    table.ForeignKey(
                        name: "FK_members_communities_CommunityId",
                        column: x => x.CommunityId,
                        principalSchema: "communities",
                        principalTable: "communities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rules",
                schema: "communities",
                columns: table => new
                {
                    Order = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CommunityId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rules", x => new { x.CommunityId, x.Order });
                    table.ForeignKey(
                        name: "FK_rules_communities_CommunityId",
                        column: x => x.CommunityId,
                        principalSchema: "communities",
                        principalTable: "communities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_communities_Slug",
                schema: "communities",
                table: "communities",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_communities_Status_Visibility_UpdatedAtUtc",
                schema: "communities",
                table: "communities",
                columns: new[] { "Status", "Visibility", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_members_UserId_Status",
                schema: "communities",
                table: "members",
                columns: new[] { "UserId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit",
                schema: "communities");

            migrationBuilder.DropTable(
                name: "members",
                schema: "communities");

            migrationBuilder.DropTable(
                name: "rules",
                schema: "communities");

            migrationBuilder.DropTable(
                name: "communities",
                schema: "communities");
        }
    }
}
#pragma warning restore CA1861
