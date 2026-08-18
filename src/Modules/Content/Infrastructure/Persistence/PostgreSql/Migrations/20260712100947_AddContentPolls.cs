using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddContentPolls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "poll_ballots",
                schema: "content",
                columns: table => new
                {
                    PollId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    OptionIds = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    CastAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_poll_ballots", x => new { x.PollId, x.ActorId });
                });

            migrationBuilder.CreateTable(
                name: "polls",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Question = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    AllowMultiple = table.Column<bool>(type: "boolean", nullable: false),
                    ClosesAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_polls", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "poll_options",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PollId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    VoteCount = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_poll_options", x => new { x.PollId, x.Id });
                    table.ForeignKey(
                        name: "FK_poll_options_polls_PollId",
                        column: x => x.PollId,
                        principalSchema: "content",
                        principalTable: "polls",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_polls_ClosesAtUtc",
                schema: "content",
                table: "polls",
                column: "ClosesAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_polls_PostId",
                schema: "content",
                table: "polls",
                column: "PostId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "poll_ballots",
                schema: "content");

            migrationBuilder.DropTable(
                name: "poll_options",
                schema: "content");

            migrationBuilder.DropTable(
                name: "polls",
                schema: "content");
        }
    }
}
