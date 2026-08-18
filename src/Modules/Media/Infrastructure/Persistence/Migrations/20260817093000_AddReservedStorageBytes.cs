using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZosyalMedya.Modules.Media.Infrastructure.Persistence.Migrations;

[DbContext(typeof(MediaDbContext))]
[Migration("20260817093000_AddReservedStorageBytes")]
public partial class AddReservedStorageBytes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(
            name: "ReservedStorageBytes",
            schema: "media",
            table: "assets",
            type: "bigint",
            nullable: false,
            defaultValue: 0L);

        migrationBuilder.Sql("""
            UPDATE media.assets AS asset
            SET "ReservedStorageBytes" = GREATEST(asset."ExpectedSize", asset."ActualSize") +
                COALESCE((SELECT SUM(variant."Size") FROM media.variants AS variant
                          WHERE variant."MediaId" = asset."Id"), 0)
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "ReservedStorageBytes", schema: "media", table: "assets");
}
