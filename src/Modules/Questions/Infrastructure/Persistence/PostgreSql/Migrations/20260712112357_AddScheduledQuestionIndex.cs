using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
#pragma warning disable CA1861 // EF migration API requires generated column arrays.

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduledQuestionIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_questions_Status_PublishAtUtc_Id",
                schema: "questions",
                table: "questions",
                columns: new[] { "Status", "PublishAtUtc", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_questions_Status_PublishAtUtc_Id",
                schema: "questions",
                table: "questions");
        }
    }
}
#pragma warning restore CA1861
