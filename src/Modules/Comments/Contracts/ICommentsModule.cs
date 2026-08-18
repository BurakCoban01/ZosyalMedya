namespace ZosyalMedya.Modules.Comments.Contracts;public interface ICommentsModule{Task<long>CountVisibleAsync(Guid contentId,CancellationToken cancellationToken=default);}
