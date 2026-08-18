using ZosyalMedya.BuildingBlocks.Application.Persistence;using ZosyalMedya.Modules.Comments.Domain.Comments;namespace ZosyalMedya.Modules.Comments.Application.Ports;
public sealed record CommentPageQuery(CommentedContentId ContentId,DateTimeOffset?CursorTime,CommentId?CursorId,int Limit);
public interface ICommentRepository:IRepository<Comment,CommentId>{Task<long>CountVisibleAsync(CommentedContentId contentId,CancellationToken cancellationToken=default);Task<IReadOnlyList<Comment>>ListPageAsync(CommentPageQuery query,CancellationToken cancellationToken=default);}
