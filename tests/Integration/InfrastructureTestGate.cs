namespace ZosyalMedya.Tests.Integration;

internal static class InfrastructureTestGate
{
    public static bool IsEnabled => string.Equals(
        Environment.GetEnvironmentVariable("RUN_INFRASTRUCTURE_TESTS"),
        "true",
        StringComparison.OrdinalIgnoreCase);
}
