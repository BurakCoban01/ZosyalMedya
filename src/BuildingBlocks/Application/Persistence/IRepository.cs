using System.Linq.Expressions;

namespace ZosyalMedya.BuildingBlocks.Application.Persistence;

public enum SortDirection { Ascending, Descending }

public sealed record SortExpression<TEntity>(
    Expression<Func<TEntity, object>> KeySelector,
    SortDirection Direction);

public sealed record QueryOptions<TEntity>(
    int Limit = 50,
    IReadOnlyList<SortExpression<TEntity>>? Sort = null,
    string? Cursor = null)
{
    public const int MaximumLimit = 100;
    public int BoundedLimit => Math.Clamp(Limit, 1, MaximumLimit);
}

/// <summary>
/// Uygulama katmanını EF Core ve MongoDB sürücü tiplerinden yalıtan depolama portu.
/// IQueryable özellikle döndürülmez; sorgu kapsamı bu sözleşmeyle sınırlandırılır.
/// </summary>
public interface IRepository<TEntity, TId>
    where TEntity : class
    where TId : notnull
{
    Task<TEntity?> SelectAsync(
        Expression<Func<TEntity, bool>> predicate,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TEntity>> ListByFilterAsync(
        Expression<Func<TEntity, bool>> predicate,
        QueryOptions<TEntity>? options = null,
        CancellationToken cancellationToken = default);

    Task<TId> CreateAsync(TEntity entity, CancellationToken cancellationToken = default);

    Task<bool> UpdateAsync(
        Expression<Func<TEntity, bool>> predicate,
        TEntity replacement,
        long? expectedVersion = null,
        CancellationToken cancellationToken = default);

    Task<long> DeleteByFilterAsync(
        Expression<Func<TEntity, bool>> predicate,
        CancellationToken cancellationToken = default);
}

public sealed class PersistenceConflictException(string code, string message, Exception? innerException = null)
    : Exception(message, innerException)
{
    public string Code { get; } = code;
}
