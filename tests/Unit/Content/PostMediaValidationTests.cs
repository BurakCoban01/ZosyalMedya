using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using System.Linq.Expressions;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Content;

public sealed class PostMediaValidationTests
{
    private static readonly Guid Author = Guid.NewGuid();

    [Fact]
    public async Task CreateRejectsMissingOrDeletedMediaBeforePersistingPost()
    {
        var handler = Handler(new StubMediaModule(null));
        var result = await handler.HandleAsync(Command(Guid.NewGuid(), PostVisibility.Public), default);
        Assert.False(result.IsSuccess);
        Assert.Equal("content.media_invalid", result.Error.Code);
    }

    [Fact]
    public async Task CreateRejectsMediaOwnedByAnotherAccount()
    {
        var id = Guid.NewGuid();
        var handler = Handler(new StubMediaModule(new(id, Guid.NewGuid(), "image/png", 10, "Public", "Ready", null)));
        var result = await handler.HandleAsync(Command(id, PostVisibility.Public), default);
        Assert.False(result.IsSuccess);
        Assert.Equal("content.media_invalid", result.Error.Code);
    }

    [Theory]
    [InlineData(PostVisibility.Public, "Followers")]
    [InlineData(PostVisibility.Followers, "Private")]
    [InlineData(PostVisibility.CloseFriends, "Private")]
    public async Task CreateRejectsMediaWhoseAudienceDoesNotExactlyMatchPost(PostVisibility postVisibility,
        string mediaVisibility)
    {
        var id = Guid.NewGuid();
        var handler = Handler(new StubMediaModule(new(id, Author, "image/png", 10, mediaVisibility, "Ready", null)));
        var result = await handler.HandleAsync(Command(id, postVisibility), default);
        Assert.False(result.IsSuccess);
        Assert.Equal("content.media_visibility_mismatch", result.Error.Code);
    }

    [Fact]
    public async Task UpdateRejectsAChangedAudienceBeforePersistingMediaPost()
    {
        var id=Guid.NewGuid();var post=Post.Create(PostId.New(),new ContentAuthorId(Author),"Önce",[id],PostVisibility.Public,ShareKind.Original,null,null,null,false,false,null,DateTimeOffset.UtcNow);
        var media=new StubMediaModule(new(id,Author,"image/png",10,"Public","Ready",null));
        var handler=new UpdatePostHandler(new StubPostRepository(post),null!,null!,null!,media);
        var result=await handler.HandleAsync(new(post.Id,new ContentAuthorId(Author),"Sonra",[id],PostVisibility.Followers,null,null,false,post.Version),default);
        Assert.False(result.IsSuccess);Assert.Equal("content.media_visibility_mismatch",result.Error.Code);
    }

    private static CreatePostHandler Handler(IMediaModule media) =>
        new(null!, null!, null!, null!, null!, media);

    private static CreatePostCommand Command(Guid mediaId, PostVisibility visibility) =>
        new(new ContentAuthorId(Author), "Gerçek medya", [mediaId], visibility, ShareKind.Original, null, null,
            null, false, false, null);

    private sealed class StubMediaModule(MediaAccess? access) : IMediaModule
    {
        public Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId,
            CancellationToken cancellationToken = default) => Task.FromResult(access);
    }

    private sealed class StubPostRepository(Post post):IPostRepository
    {
        public Task<Post?> SelectAsync(Expression<Func<Post,bool>> predicate,CancellationToken cancellationToken=default)=>Task.FromResult<Post?>(post);
        public Task<IReadOnlyList<Post>> ListByFilterAsync(Expression<Func<Post,bool>> predicate,QueryOptions<Post>? options=null,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<PostId> CreateAsync(Post entity,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Post,bool>> predicate,Post replacement,long? expectedVersion=null,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Post,bool>> predicate,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<IReadOnlyList<Post>> ListFeedPageAsync(PostFeedQuery request,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<IReadOnlyList<Post>> ListDueScheduledAsync(DateTimeOffset now,int limit,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
    }
}
