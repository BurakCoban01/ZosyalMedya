namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;

internal static class MongoIdentityMappingGate
{
    public static object SyncRoot { get; } = new();
}
