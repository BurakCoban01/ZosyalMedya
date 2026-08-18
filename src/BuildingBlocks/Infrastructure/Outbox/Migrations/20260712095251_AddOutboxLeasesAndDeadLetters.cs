using System;
using Microsoft.EntityFrameworkCore.Migrations;

#pragma warning disable CA1861 // EF Core tarafından üretilen sabit migration kolon dizileri.

#nullable disable

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Outbox.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboxLeasesAndDeadLetters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_outbox_ProcessedAtUtc_NextAttemptAtUtc",
                schema: "integration",
                table: "outbox");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeadLetteredAtUtc",
                schema: "integration",
                table: "outbox",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LockedBy",
                schema: "integration",
                table: "outbox",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LockedUntilUtc",
                schema: "integration",
                table: "outbox",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_outbox_ProcessedAtUtc_DeadLetteredAtUtc_NextAttemptAtUtc_Lo~",
                schema: "integration",
                table: "outbox",
                columns: new[] { "ProcessedAtUtc", "DeadLetteredAtUtc", "NextAttemptAtUtc", "LockedUntilUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_outbox_ProcessedAtUtc_DeadLetteredAtUtc_NextAttemptAtUtc_Lo~",
                schema: "integration",
                table: "outbox");

            migrationBuilder.DropColumn(
                name: "DeadLetteredAtUtc",
                schema: "integration",
                table: "outbox");

            migrationBuilder.DropColumn(
                name: "LockedBy",
                schema: "integration",
                table: "outbox");

            migrationBuilder.DropColumn(
                name: "LockedUntilUtc",
                schema: "integration",
                table: "outbox");

            migrationBuilder.CreateIndex(
                name: "IX_outbox_ProcessedAtUtc_NextAttemptAtUtc",
                schema: "integration",
                table: "outbox",
                columns: new[] { "ProcessedAtUtc", "NextAttemptAtUtc" });
        }
    }
}
#pragma warning restore CA1861
