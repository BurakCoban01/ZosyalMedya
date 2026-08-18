using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddPollForeignKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddForeignKey(
                name: "FK_poll_ballots_polls_PollId",
                schema: "content",
                table: "poll_ballots",
                column: "PollId",
                principalSchema: "content",
                principalTable: "polls",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_polls_posts_PostId",
                schema: "content",
                table: "polls",
                column: "PostId",
                principalSchema: "content",
                principalTable: "posts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_poll_ballots_polls_PollId",
                schema: "content",
                table: "poll_ballots");

            migrationBuilder.DropForeignKey(
                name: "FK_polls_posts_PostId",
                schema: "content",
                table: "polls");
        }
    }
}
