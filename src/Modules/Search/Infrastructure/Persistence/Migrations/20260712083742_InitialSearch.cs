using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable
#pragma warning disable CA1861 // EF Core migration metadata intentionally uses constant arrays.

namespace ZosyalMedya.Modules.Search.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "search");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "documents",
                schema: "search",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    Tags = table.Column<string[]>(type: "text[]", nullable: false),
                    Visibility = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeepLink = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    SearchVector = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "to_tsvector('simple', coalesce(\"Title\", '') || ' ' || coalesce(\"Body\", ''))", stored: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_documents", x => new { x.Id, x.Type });
                });

            migrationBuilder.CreateTable(
                name: "recent_searches",
                schema: "search",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Query = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SearchedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recent_searches", x => new { x.UserId, x.Query });
                });

            migrationBuilder.CreateIndex(
                name: "IX_documents_IsHidden_IsDeleted_Type_UpdatedAtUtc",
                schema: "search",
                table: "documents",
                columns: new[] { "IsHidden", "IsDeleted", "Type", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_documents_SearchVector",
                schema: "search",
                table: "documents",
                column: "SearchVector")
                .Annotation("Npgsql:IndexMethod", "GIN");

            migrationBuilder.CreateIndex(
                name: "IX_documents_Title",
                schema: "search",
                table: "documents",
                column: "Title")
                .Annotation("Npgsql:IndexMethod", "GIN")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_recent_searches_UserId_SearchedAtUtc",
                schema: "search",
                table: "recent_searches",
                columns: new[] { "UserId", "SearchedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "documents",
                schema: "search");

            migrationBuilder.DropTable(
                name: "recent_searches",
                schema: "search");
        }
    }
}
#pragma warning restore CA1861
