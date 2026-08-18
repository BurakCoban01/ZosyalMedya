namespace ZosyalMedya.BuildingBlocks.Domain;

/// <summary>Test edilebilir iş zamanı için UTC saat portudur.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public interface IDomainEvent
{
    DateTimeOffset OccurredAtUtc { get; }
}

public abstract class Entity<TId> where TId : notnull
{
    protected Entity(TId id) => Id = id;
    public TId Id { get; protected init; }
}

public abstract class AggregateRoot<TId>
    : IAggregateRoot
    where TId : notnull
{
    private readonly List<IDomainEvent> _domainEvents = [];

    protected AggregateRoot(TId id) => Id = id;

    public TId Id { get; protected init; }
    public long Version { get; protected set; }
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);
    public void ClearDomainEvents() => _domainEvents.Clear();
}

public interface IAggregateRoot
{
    IReadOnlyCollection<IDomainEvent> DomainEvents { get; }
    void ClearDomainEvents();
}

public sealed record OperationError(string Code, string Message)
{
    public static readonly OperationError None = new(string.Empty, string.Empty);
}

public readonly record struct Result<T>(T? Value, OperationError Error)
{
    public bool IsSuccess => Error == OperationError.None;
}

public static class Result
{
    public static Result<T> Success<T>(T value) => new(value, OperationError.None);
    public static Result<T> Failure<T>(string code, string message) => new(default, new OperationError(code, message));
}

public sealed class DomainRuleException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
