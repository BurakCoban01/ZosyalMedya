using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF Core migration generator emits constant column arrays.

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class InitialQuestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "questions");

            migrationBuilder.CreateTable(
                name: "questions",
                schema: "questions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    IsAnonymous = table.Column<bool>(type: "boolean", nullable: false),
                    Audience = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AnswerBody = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    PublishAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AnsweredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_questions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_questions_SenderId_CreatedAtUtc",
                schema: "questions",
                table: "questions",
                columns: new[] { "SenderId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_questions_TargetId_Status_CreatedAtUtc",
                schema: "questions",
                table: "questions",
                columns: new[] { "TargetId", "Status", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "questions",
                schema: "questions");
        }
    }
}
#pragma warning restore CA1861
