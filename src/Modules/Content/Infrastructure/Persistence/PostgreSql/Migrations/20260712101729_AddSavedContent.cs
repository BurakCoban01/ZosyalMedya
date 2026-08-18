using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core tarafından üretilen sabit migration kolon dizileri.

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddSavedContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "saved_content",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    Collection = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_content", x => x.Id);
                    table.ForeignKey(
                        name: "FK_saved_content_posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "content",
                        principalTable: "posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_saved_content_OwnerId_Collection_CreatedAtUtc",
                schema: "content",
                table: "saved_content",
                columns: new[] { "OwnerId", "Collection", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_saved_content_OwnerId_PostId_Collection",
                schema: "content",
                table: "saved_content",
                columns: new[] { "OwnerId", "PostId", "Collection" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_saved_content_PostId",
                schema: "content",
                table: "saved_content",
                column: "PostId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "saved_content",
                schema: "content");
        }
    }
}
#pragma warning restore CA1861
