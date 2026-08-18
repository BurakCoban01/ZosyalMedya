using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Domain.Posts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Content;
public sealed class PostTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 9, 0, 0, TimeSpan.Zero);
    [Fact] public void CreateExtractsMentionsAndHashtagsAndEditKeepsRevision(){var author=new ContentAuthorId(Guid.NewGuid());var post=Post.Create(PostId.New(),author,"Merhaba @deneme #Mimari #mimari",[],PostVisibility.Public,ShareKind.Original,null,null,null,false,false,null,Now);Assert.Equal(["deneme"],post.Mentions);Assert.Equal(["mimari"],post.Hashtags);var version=post.Version;post.Edit(author,"Güncel @kullanici #DDD",[],PostVisibility.Followers,"https://example.test/item","Uyarı",true,Now.AddMinutes(1));Assert.Equal(version+1,post.Version);Assert.Single(post.Revisions);Assert.Equal("Merhaba @deneme #Mimari #mimari",post.Revisions[0].Text);}
    [Fact] public void RepostCannotCarryText(){Assert.Throws<DomainRuleException>(()=>Post.Create(PostId.New(),new(Guid.NewGuid()),"yorum",[],PostVisibility.Public,ShareKind.Repost,PostId.New(),null,null,false,false,null,Now));}
    [Fact] public void RepostUsesOriginalAsItsContent(){var original=PostId.New();var repost=Post.Create(PostId.New(),new(Guid.NewGuid()),null,[],PostVisibility.Public,ShareKind.Repost,original,null,null,false,false,null,Now);Assert.Equal(ShareKind.Repost,repost.ShareKind);Assert.Equal(original,repost.OriginalPostId);Assert.Empty(repost.Text);}
    [Fact] public void DeleteCreatesTombstoneAndRejectsFurtherChanges(){var author=new ContentAuthorId(Guid.NewGuid());var post=Post.Create(PostId.New(),author,"Silinecek içerik",[],PostVisibility.Public,ShareKind.Original,null,null,null,false,false,null,Now);post.Delete(author,Now.AddMinutes(1));Assert.Equal(PostStatus.Deleted,post.Status);Assert.False(post.CanReceiveEngagement);Assert.Empty(post.Text);Assert.Throws<DomainRuleException>(()=>post.SetPinned(author,true,Now.AddMinutes(2)));}
    [Fact] public void ScheduledPostPublishesOnlyWhenDue(){var post=Post.Create(PostId.New(),new(Guid.NewGuid()),"Planlı içerik",[],PostVisibility.Public,ShareKind.Original,null,null,null,false,false,Now.AddHours(1),Now);post.PublishDue(Now.AddMinutes(30));Assert.Equal(PostStatus.Scheduled,post.Status);post.PublishDue(Now.AddHours(1));Assert.Equal(PostStatus.Published,post.Status);Assert.NotNull(post.PublishedAtUtc);}
}
