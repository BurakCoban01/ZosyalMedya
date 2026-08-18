using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

namespace ZosyalMedya.Modules.SocialGraph.Application.Ports;

public enum RelationshipReadKind { Followers, Following, PendingIncoming }
public sealed record RelationshipPageQuery(GraphUserId OwnerId, RelationshipReadKind Kind, int Offset, int Limit);

public interface IRelationshipRepository : IRepository<Relationship, RelationshipId>
{
    Task<long> CountAsync(GraphUserId ownerId, RelationshipReadKind kind,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Relationship>> ListPageAsync(RelationshipPageQuery query,
        CancellationToken cancellationToken = default);
}
