using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable
#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "content");

            migrationBuilder.CreateTable(
                name: "posts",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    MediaIds = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    Mentions = table.Column<string[]>(type: "text[]", nullable: false),
                    Hashtags = table.Column<string[]>(type: "text[]", nullable: false),
                    LinkUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ContentWarning = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    IsSensitive = table.Column<bool>(type: "boolean", nullable: false),
                    Visibility = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ShareKind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OriginalPostId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsPinned = table.Column<bool>(type: "boolean", nullable: false),
                    PublishAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PublishedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_posts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "post_revisions",
                schema: "content",
                columns: table => new
                {
                    Revision = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    LinkUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ContentWarning = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    EditedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_post_revisions", x => new { x.PostId, x.Revision });
                    table.ForeignKey(
                        name: "FK_post_revisions_posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "content",
                        principalTable: "posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_posts_AuthorId_Status_PublishedAtUtc",
                schema: "content",
                table: "posts",
                columns: new[] { "AuthorId", "Status", "PublishedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_posts_OriginalPostId",
                schema: "content",
                table: "posts",
                column: "OriginalPostId");

            migrationBuilder.CreateIndex(
                name: "IX_posts_Status_Visibility_PublishedAtUtc",
                schema: "content",
                table: "posts",
                columns: new[] { "Status", "Visibility", "PublishedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "post_revisions",
                schema: "content");

            migrationBuilder.DropTable(
                name: "posts",
                schema: "content");
        }
    }
}
#pragma warning restore CA1861
