using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core tarafından üretilen sabit migration kolon dizileri.

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddPostImpressions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ViewCount",
                schema: "content",
                table: "posts",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "post_impressions",
                schema: "content",
                columns: table => new
                {
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    ViewerHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UtcDay = table.Column<DateOnly>(type: "date", nullable: false),
                    RecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_post_impressions", x => new { x.PostId, x.ViewerHash, x.UtcDay });
                    table.ForeignKey(
                        name: "FK_post_impressions_posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "content",
                        principalTable: "posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "post_impressions",
                schema: "content");

            migrationBuilder.DropColumn(
                name: "ViewCount",
                schema: "content",
                table: "posts");
        }
    }
}
#pragma warning restore CA1861
