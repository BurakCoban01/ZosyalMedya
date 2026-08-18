import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  Api,
  CommentView,
  createComment,
  createPoll,
  createPost,
  deletePost,
  FeedItem,
  getFeed,
  getMyProfile,
  getPoll,
  getReactionSummary,
  listComments,
  listSavedContent,
  removeReaction,
  removeSavedContent,
  saveContent,
  setReaction,
  updatePost,
  votePoll
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { OnlineStatusService } from '../../core/connectivity/online-status.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { SessionMediaCleanup } from '../../core/media/session-media-cleanup.service';
import { FeedPage } from './feed.page';

/** Minimal FeedItem factory. Only the fields the page reads are populated. */
function feedItem(id: string, text = 'Merhaba dünya', hashtags: string[] = []): FeedItem {
  return {
    content: {
      id,
      authorId: id.repeat(2).slice(0, 16),
      text,
      hashtags,
      linkUrl: null,
      mediaIds: [],
      mentions: [],
      visibility: 'Public',
      contentWarning: null,
      isSensitive: false,
      isPinned: false,
      originalPostId: null,
      publishedAtUtc: '2026-07-29T10:00:00Z',
      shareKind: 'Original',
      status: 'Published',
      version: 1,
      viewCount: 0
    },
    hasPoll: false,
    reactions: { counts: {}, viewerReaction: null },
    commentCount: 0,
    saveCount: 0,
    viewCount: 0,
    rankingReasons: []
  } as unknown as FeedItem;
}

function createdPost(id: string, text: string) {
  return {
    id,
    authorId: 'viewer-id',
    text,
    hashtags: [],
    mentions: [],
    mediaIds: [],
    visibility: 'Public' as const,
    contentWarning: null,
    isSensitive: false,
    isPinned: false,
    linkUrl: null,
    originalPostId: null,
    createdAtUtc: '2026-08-12T18:00:00Z',
    publishedAtUtc: '2026-08-12T18:00:00Z',
    publishAtUtc: null,
    shareKind: 'Original' as const,
    status: 'Published' as const,
    version: 1,
    viewCount: 0,
  };
}

/** Builds a TestBed that stubs the Api + OnlineStatusService. The `invoke`
 *  mock defaults to an empty Following feed; per-test overrides reassign. */
async function mountFeed(
  invoke: (operation: unknown, params?: unknown) => Promise<unknown>,
  offline = false
): Promise<FeedPage> {
  return (await renderFeed(invoke, offline)).componentInstance;
}

async function renderFeed(
  invoke: (operation: unknown, params?: unknown) => Promise<unknown>,
  offline = false
): Promise<ComponentFixture<FeedPage>> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      imports: [FeedPage],
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { invoke } },
        { provide: MediaResolver, useValue: { resolve: vi.fn(), sessionRevision: signal(0) } },
        { provide: SessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
        { provide: TokenVault, useValue: { accessToken: () => null, registerBeforeSessionChange: () => vi.fn() } },
        {
          provide: OnlineStatusService,
          useValue: {
            isOnline: () => !offline,
            isOffline: () => offline
          }
        }
      ]
    })
    .compileComponents();
  const fixture = TestBed.createComponent(FeedPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('FeedPage polls', () => {
  it('creates the post first and attaches a valid poll', async () => {
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      if (operation === createPost) return createdPost('11111111-1111-1111-1111-111111111111', 'Mimari tercihi');
      if (operation === createPoll) return {
        id: 'poll-id',
        postId: '11111111-1111-1111-1111-111111111111',
        question: 'Hangisi?',
        options: [],
        allowMultiple: false,
        closesAtUtc: '2026-08-13T18:00:00Z',
        isOpen: true,
        totalVotes: 0,
      };
      const body = (params as { body?: { options?: unknown[] } } | undefined)?.body;
      void body;
      return {};
    });
    const page = await mountFeed(invoke);
    page.togglePoll();
    page.composer.patchValue({ text: 'Mimari tercihi', pollQuestion: 'Hangisi?', contentWarning: 'Yoğun tartışma', isSensitive: true });
    page.pollOptions.at(0).setValue('Bir'); page.pollOptions.at(1).setValue('İki');

    await page.publish();

    expect(invoke.mock.calls.some(call => call[0] === createPost)).toBe(true);
    expect(invoke.mock.calls.some(call => {
      if (call[0] !== createPoll) return false;
      const body = (call[1] as { body?: { options?: unknown[] } } | undefined)?.body;
      return Array.isArray(body?.options) && body!.options!.length === 2;
    })).toBe(true);
    expect(page.items()[0].content.text).toBe('Mimari tercihi');
    expect(page.items()[0].hasPoll).toBe(true);
    const createCall = invoke.mock.calls.find(call => call[0] === createPost);
    expect((createCall?.[1] as { body: Record<string, unknown> }).body).toMatchObject({ contentWarning: 'Yoğun tartışma', isSensitive: true });
  });

  it('creates an exact 4-option multiple-choice payload and resets completely', async () => {
    let payload: { options: string[]; allowMultiple: boolean; closesAtUtc: string } | null = null;
    const before = Date.now();
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      if (operation === createPost) return createdPost('22222222-2222-2222-2222-222222222222', 'Dört seçenek');
      if (operation === createPoll) { payload = (params as { body: { options:string[];allowMultiple:boolean;closesAtUtc:string } }).body; return { id:'poll',postId:'22222222-2222-2222-2222-222222222222',question:'Seç?',options:[],allowMultiple:true,closesAtUtc:payload.closesAtUtc,isOpen:true,totalVotes:0 }; }
      return {};
    });
    const page = await mountFeed(invoke);
    page.togglePoll(); page.addPollOption(); page.addPollOption();
    page.composer.patchValue({ text:'Dört seçenek', pollQuestion:'Seç?', pollAllowMultiple:true, pollDurationDays:7 });
    [' Bir ','İki','Üç','Dört'].forEach((value,index)=>page.pollOptions.at(index).setValue(value));

    await page.publish();

    expect(payload).toMatchObject({ options:['Bir','İki','Üç','Dört'], allowMultiple:true });
    expect(new Date(payload!.closesAtUtc).getTime()).toBeGreaterThanOrEqual(before + 7 * 86_400_000 - 1000);
    expect(page.pollEnabled()).toBe(false);
    expect(page.pollOptions.length).toBe(2);
    expect(page.composer.controls.pollAllowMultiple.value).toBe(false);
    expect(page.composer.controls.pollDurationDays.value).toBe(1);
  });

  it('bounds options at 2–6 and rejects blanks or normalized duplicates', async () => {
    const invoke = vi.fn(async operation => operation === getFeed ? { items: [], nextCursor: null } : {});
    const page = await mountFeed(invoke); page.togglePoll();
    page.removePollOption(0); expect(page.pollOptions.length).toBe(2);
    for(let index=0;index<6;index++) page.addPollOption();
    expect(page.pollOptions.length).toBe(6);
    page.composer.patchValue({ text:'Geçersiz anket', pollQuestion:'Hangisi?' });
    ['A',' a ','C','D','E',''].forEach((value,index)=>page.pollOptions.at(index).setValue(value));

    await page.publish();

    expect(invoke.mock.calls.some(call=>call[0]===createPost)).toBe(false);
    expect(page.message()).toContain('benzersiz');
  });

  it('collects unique multiple-choice selections and submits them together', async () => {
    const source = feedItem('multi-vote'); source.hasPoll = true;
    const poll = { id:'poll',postId:source.content.id,question:'Seç?',allowMultiple:true,closesAtUtc:'2026-08-20T00:00:00Z',isOpen:true,totalVotes:0,options:[{id:'a',text:'A',voteCount:0},{id:'b',text:'B',voteCount:0}] };
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items:[source],nextCursor:null };
      if (operation === getPoll) return poll;
      if (operation === votePoll) return { ...poll,totalVotes:2 };
      return {};
    });
    const page = await mountFeed(invoke);
    await page.vote(source.content.id,'a'); await page.vote(source.content.id,'b');
    expect(page.pollSelections()[source.content.id]).toEqual(['a','b']);

    await page.submitPollVote(source.content.id);

    expect(invoke).toHaveBeenCalledWith(votePoll,{contentId:source.content.id,body:{optionIds:['a','b']}});
    expect(page.pollSelections()[source.content.id]).toEqual([]);
  });

  it('removes a half-created post and preserves the complete draft when poll creation fails', async () => {
    const post = createdPost('33333333-3333-3333-3333-333333333333', 'Korunan taslak');
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      if (operation === createPost) return post;
      if (operation === createPoll) throw new Error('poll failed');
      if (operation === deletePost) return { ...post, status: 'Deleted' };
      return {};
    });
    const page = await mountFeed(invoke);
    page.togglePoll();
    page.composer.patchValue({ text:'Korunan taslak',pollQuestion:'Hangisi?',contentWarning:'Önemli not',isSensitive:true });
    page.pollOptions.at(0).setValue('Bir'); page.pollOptions.at(1).setValue('İki');

    await page.publish();

    expect(invoke).toHaveBeenCalledWith(deletePost, { contentId: post.id });
    expect(page.composer.controls.text.value).toBe('Korunan taslak');
    expect(page.composer.controls.contentWarning.value).toBe('Önemli not');
    expect(page.composer.controls.isSensitive.value).toBe(true);
    expect(page.pollEnabled()).toBe(true);
    expect(page.message()).toContain('metnin korunuyor');
  });
});

describe('FeedPage owner actions', () => {
  const profile = { id:'profile',ownerId:'viewer-id',handle:'demo_user',displayName:'Demo Kullanıcı',biography:null,location:null,organization:null,websiteUrl:null,profileMediaId:null,coverMediaId:null,isPrivate:false,isVerified:false,theme:'System',language:'Turkish',reduceMotion:false,completenessPercentage:80,version:1 };

  it('updates only the current owner post with its exact expected version', async () => {
    const source = feedItem('owned-post'); source.content.authorId = profile.ownerId;
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items:[source],nextCursor:null };
      if (operation === getMyProfile) return profile;
      if (operation === updatePost) return { ...createdPost(source.content.id,'Düzenlenmiş metin'),visibility:'Followers',contentWarning:'Yeni not',isSensitive:true,version:2 };
      return {};
    });
    const page = await mountFeed(invoke);
    page.startEdit(page.items()[0]);
    page.editForm.patchValue({ text:'Düzenlenmiş metin',visibility:'Followers',contentWarning:'Yeni not',isSensitive:true });

    await page.saveEdit(page.items()[0]);

    expect(invoke).toHaveBeenCalledWith(updatePost, { contentId:source.content.id,body:expect.objectContaining({expectedVersion:1,text:'Düzenlenmiş metin',visibility:'Followers',contentWarning:'Yeni not',isSensitive:true}) });
    expect(page.items()[0].content).toMatchObject({text:'Düzenlenmiş metin',visibility:'Followers',contentWarning:'Yeni not',isSensitive:true,version:2});
    expect(page.editingId()).toBeNull();
  });

  it('requires confirmation before deleting an owned post', async () => {
    const source = feedItem('owned-delete'); source.content.authorId = profile.ownerId;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items:[source],nextCursor:null };
      if (operation === getMyProfile) return profile;
      if (operation === deletePost) return { ...createdPost(source.content.id,''),status:'Deleted' };
      return {};
    });
    const page = await mountFeed(invoke);

    page.requestDelete(page.items()[0]);
    expect(page.deleteConfirmId()).toBe(source.content.id);
    expect(invoke.mock.calls.some(call=>call[0]===deletePost)).toBe(false);
    await page.confirmDelete(page.items()[0]);

    expect(invoke).toHaveBeenCalledWith(deletePost,{contentId:source.content.id});
    expect(page.items()).toHaveLength(0);
  });

  it('opens and confirms owner deletion through the rendered controls', async () => {
    const source = feedItem('owned-delete-dom'); source.content.authorId = profile.ownerId;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items:[source],nextCursor:null };
      if (operation === getMyProfile) return profile;
      if (operation === deletePost) return { ...createdPost(source.content.id,''),status:'Deleted' };
      return {};
    });
    const fixture = await renderFeed(invoke);
    const root = fixture.nativeElement as HTMLElement;
    const ownerDelete = Array.from(root.querySelectorAll<HTMLButtonElement>('.owner-actions__menu button')).find(button => button.textContent?.trim() === 'Sil')!;
    ownerDelete.click(); fixture.detectChanges();
    expect(root.querySelector('.owner-confirm')).toBeTruthy();
    const confirm = Array.from(root.querySelectorAll<HTMLButtonElement>('.owner-confirm button')).find(button => button.textContent?.trim() === 'Gönderiyi sil')!;
    confirm.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(invoke).toHaveBeenCalledWith(deletePost,{contentId:source.content.id});
    expect(root.querySelector('.owner-confirm')).toBeNull();
  });

  it('never opens owner controls or mutations for another author', async () => {
    const source = feedItem('foreign-post'); source.content.authorId = 'another-owner';
    const invoke = vi.fn(async (operation: unknown) => operation === getFeed ? {items:[source],nextCursor:null} : operation === getMyProfile ? profile : {});
    const page = await mountFeed(invoke);

    page.startEdit(page.items()[0]);
    page.requestDelete(page.items()[0]);
    await page.confirmDelete(page.items()[0]);

    expect(page.canManage(page.items()[0])).toBe(false);
    expect(page.editingId()).toBeNull();
    expect(page.deleteConfirmId()).toBeNull();
    expect(invoke.mock.calls.some(call=>call[0]===updatePost||call[0]===deletePost)).toBe(false);
  });
});

describe('FeedPage media composer', () => {
  it('locks audience editing for a media-bearing post and preserves its exact visibility', async () => {
    const source=feedItem('media-edit');source.content.authorId='viewer-id';source.content.mediaIds=['media-a'];source.content.visibility='Followers';
    const invoke=vi.fn(async(operation:unknown)=>operation===getFeed?{items:[source],nextCursor:null}:operation===getMyProfile?{ownerId:'viewer-id',handle:'viewer'}:operation===updatePost?{...source.content,text:'Güncel',version:2}:{});
    const page=await mountFeed(invoke);page.startEdit(page.items()[0]);
    expect(page.editForm.controls.visibility.disabled).toBe(true);
    page.editForm.controls.text.setValue('Güncel');await page.saveEdit(page.items()[0]);
    expect(invoke).toHaveBeenCalledWith(updatePost,{contentId:source.content.id,body:expect.objectContaining({mediaIds:['media-a'],visibility:'Followers'})});
  });

  it('publishes a media-only post with the exact ready media IDs and locked visibility', async () => {
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      if (operation === createPost) return { ...createdPost('media-post', ''), mediaIds: ['media-a'] };
      void params;
      return {};
    });
    const page = await mountFeed(invoke);
    page.setComposerMediaBusy(true);
    expect(page.canPublish()).toBe(false);
    expect(page.composer.controls.visibility.disabled).toBe(true);
    page.setComposerMediaBusy(false);
    page.setComposerMediaIds(['media-a']);

    expect(page.composer.controls.visibility.disabled).toBe(true);
    expect(page.canPublish()).toBe(true);
    await page.publish();

    expect(invoke).toHaveBeenCalledWith(createPost, { body: expect.objectContaining({ text: null, mediaIds: ['media-a'], visibility: 'Public' }) });
    expect(page.composerMediaIds()).toEqual([]);
    expect(page.composer.controls.visibility.enabled).toBe(true);
  });

  it('publishes an attachment on a quote without losing its source context', async () => {
    const source = feedItem('quoted-source');
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createPost) return createdPost('quote-with-media', 'Bakışım');
      void params;
      return {};
    });
    const page = await mountFeed(invoke);
    page.openQuote(source);
    page.quoteText.setValue('Bakışım');
    page.quoteMediaIds.set(['media-q']);

    await page.publishQuote(source);

    expect(invoke).toHaveBeenCalledWith(createPost, { body: expect.objectContaining({
      text: 'Bakışım', mediaIds: ['media-q'], shareKind: 'Quote', originalPostId: source.content.id,
    }) });
  });
});

describe('FeedPage reaction integrity', () => {
  it('applies none → kind, same kind → none, and kind A → kind B exactly', async () => {
    const source = feedItem('reaction-transition');
    let serverKind: string | null = null;
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === setReaction) serverKind = (params as { body: { kind: string } }).body.kind;
      if (operation === removeReaction) serverKind = null;
      if (operation === getReactionSummary) return { contentId: source.content.id, counts: serverKind ? { [serverKind]: 1 } : {}, viewerReaction: serverKind };
      return {};
    });
    const page = await mountFeed(invoke);

    await page.react(page.items()[0], 'Like');
    expect(page.items()[0].reactions).toMatchObject({ counts: { Like: 1 }, viewerReaction: 'Like' });
    expect(invoke).toHaveBeenCalledWith(setReaction, { contentId: source.content.id, body: { kind: 'Like' } });

    await page.react(page.items()[0], 'Like');
    expect(page.items()[0].reactions.viewerReaction).toBeNull();
    expect(page.reactionCount(page.items()[0])).toBe(0);
    expect(invoke).toHaveBeenCalledWith(removeReaction, { contentId: source.content.id });

    await page.react(page.items()[0], 'Love');
    await page.react(page.items()[0], 'Support');
    expect(page.items()[0].reactions).toMatchObject({ counts: { Support: 1 }, viewerReaction: 'Support' });
    expect(page.reactionCount(page.items()[0])).toBe(1);
  });

  it('rolls back the exact prior summary when the mutation fails', async () => {
    const source = feedItem('reaction-rollback');
    source.reactions = { contentId: source.content.id, counts: { Like: 2, Love: 4 }, viewerReaction: 'Love' };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === setReaction) throw new Error('failed');
      return {};
    });
    const page = await mountFeed(invoke);
    const before = structuredClone(page.items()[0].reactions);

    await page.react(page.items()[0], 'Support');

    expect(page.items()[0].reactions).toEqual(before);
    expect(page.message()).toContain('geri alındı');
  });

  it('ignores a rapid duplicate while one request is pending', async () => {
    const source = feedItem('reaction-pending');
    let release: () => void = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === setReaction) await pending;
      if (operation === getReactionSummary) return { contentId: source.content.id, counts: { Like: 1 }, viewerReaction: 'Like' };
      return {};
    });
    const page = await mountFeed(invoke);

    const first = page.react(page.items()[0], 'Like');
    await page.react(page.items()[0], 'Like');
    expect(invoke.mock.calls.filter(call => call[0] === setReaction)).toHaveLength(1);
    release();
    await first;
  });

  it('exposes all five kinds with clear Turkish labels', async () => {
    const page = await mountFeed(async operation => operation === getFeed ? { items: [], nextCursor: null } : {});
    expect(page.reactionKinds.map(kind => page.reactionLabel(kind))).toEqual(['Beğen', 'Sevdim', 'Düşündürücü', 'Destek', 'Güldüm']);
    expect(page.reactionDescription('Insightful')).toContain('düşündüren');
  });
});

describe('FeedPage comment threads', () => {
  const source = feedItem('commented');
  const existing: CommentView = {
    id: 'comment-1',
    contentId: source.content.id,
    authorId: 'another-author',
    parentId: null,
    depth: 0,
    text: 'Gerçek yorum',
    mentions: [],
    status: 'Published',
    createdAtUtc: '2026-07-29T10:05:00Z',
    version: 1,
    author: { ownerId:'another-author', handle:'ayse_dev', displayName:'Ayşe', profileMediaId:null, isVerified:false },
    canManage: false,
  };

  it('loads real comments when the thread is opened', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === listComments) return {items:[existing],nextCursor:null};
      return {};
    });
    const page = await mountFeed(invoke);

    await page.toggleComments(source.content.id);

    expect(invoke).toHaveBeenCalledWith(listComments, { contentId: source.content.id, limit: 20, cursor:undefined });
    expect(page.comments()[source.content.id]).toEqual([existing]);
  });

  it('inserts the returned comment and clears the input only after success', async () => {
    const created = { ...existing, id: 'comment-2', text: 'Yeni yorum' };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createComment) return created;
      return {};
    });
    const page = await mountFeed(invoke);
    const input = { value: 'Yeni yorum' } as HTMLInputElement;
    const event = {
      preventDefault: vi.fn(),
      target: { querySelector: () => input },
    } as unknown as Event;

    await page.onCommentSubmit(event, source);

    expect(input.value).toBe('');
    expect(page.comments()[source.content.id]).toContainEqual(created);
    expect(page.items()[0].commentCount).toBe(1);
  });

  it('rolls back the count and preserves the input when create fails', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createComment) throw new Error('failed');
      return {};
    });
    const page = await mountFeed(invoke);
    const input = { value: 'Kaybolmamalı' } as HTMLInputElement;
    const event = {
      preventDefault: vi.fn(),
      target: { querySelector: () => input },
    } as unknown as Event;

    await page.onCommentSubmit(event, source);

    expect(input.value).toBe('Kaybolmamalı');
    expect(page.items()[0].commentCount).toBe(0);
    expect(page.message()).toContain('geri alındı');
  });
});

describe('FeedPage repost and quote flows', () => {
  it('creates a bodyless repost through the real createPost contract', async () => {
    const source = feedItem('source');
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      void params;
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createPost) return { id: 'repost-id' };
      return {};
    });
    const page = await mountFeed(invoke);

    await page.repost(source);

    const call = invoke.mock.calls.find(entry => entry[0] === createPost);
    expect(call).toBeTruthy();
    expect((call?.[1] as { body: Record<string, unknown> }).body).toMatchObject({
      text: null,
      shareKind: 'Repost',
      originalPostId: source.content.id,
      visibility: 'Public'
    });
    expect(page.message()).toBe('Gönderi yeniden paylaşıldı.');
  });

  it('publishes a quote with user-entered text and the source id', async () => {
    const source = feedItem('source');
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      void params;
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createPost) return { id: 'quote-id' };
      return {};
    });
    const page = await mountFeed(invoke);
    page.openQuote(source);
    page.quoteText.setValue('Bu bakış açısı önemli.');

    await page.publishQuote(source);

    const call = invoke.mock.calls.find(entry => entry[0] === createPost);
    expect((call?.[1] as { body: Record<string, unknown> }).body).toMatchObject({
      text: 'Bu bakış açısı önemli.',
      shareKind: 'Quote',
      originalPostId: source.content.id,
      visibility: 'Public'
    });
    expect(page.quoteTargetId()).toBeNull();
    expect(page.message()).toBe('Alıntı gönderin yayınlandı.');
  });

  it('prevents native navigation when the quote form is submitted', async () => {
    const source = feedItem('source');
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [source], nextCursor: null };
      if (operation === createPost) return { id: 'quote-id' };
      return {};
    });
    const page = await mountFeed(invoke);
    const preventDefault = vi.fn();
    page.openQuote(source);
    page.quoteText.setValue('Sayfadan ayrılmadan yayınla.');

    await page.onQuoteSubmit({ preventDefault } as unknown as Event, source);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(invoke.mock.calls.some(entry => entry[0] === createPost)).toBe(true);
    expect(page.message()).toBe('Alıntı gönderin yayınlandı.');
  });

  it('does not offer repost or quote for limited-visibility content', async () => {
    const source = feedItem('source');
    source.content.visibility = 'Followers';
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      void params;
      if (operation === getFeed) return { items: [source], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);

    await page.repost(source);
    page.openQuote(source);

    expect(invoke.mock.calls.some(entry => entry[0] === createPost)).toBe(false);
    expect(page.quoteTargetId()).toBeNull();
    expect(page.canShare(source)).toBe(false);
  });
});

describe('FeedPage saved collection semantics', () => {
  it('hydrates persisted saved state from the real collection', async () => {
    const saved = feedItem('saved-content');
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [saved], nextCursor: null };
      if (operation === listSavedContent) {
        return { items: [{ id: 'saved-id', collection: 'Genel', content: saved.content, savedAtUtc: '2026-08-12T10:00:00Z' }], nextCursor: null };
      }
      return {};
    });

    const page = await mountFeed(invoke);

    expect(invoke).toHaveBeenCalledWith(listSavedContent, { collection: 'Genel', limit: 50 });
    expect(page.savedIds().has(saved.content.id)).toBe(true);
  });

  it('uses the same real collection for save and remove', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);

    await page.toggleSaved('content-id');
    await page.toggleSaved('content-id');

    expect(invoke).toHaveBeenCalledWith(saveContent, {
      contentId: 'content-id',
      body: { collection: 'Genel' }
    });
    expect(invoke).toHaveBeenCalledWith(removeSavedContent, {
      contentId: 'content-id',
      collection: 'Genel'
    });
  });
});

describe('FeedPage async states (VAL-FEED-001)', () => {
  it('clears the signed-out view without firing protected feed, save or profile reads', async () => {
    const accessToken = signal<string | null>('x.eyJzdWIiOiJvd25lci0xIn0.x');
    const invoke = vi.fn(async (operation: unknown) => operation === getFeed
      ? { items: [feedItem('signed-in')], nextCursor: null }
      : operation === listSavedContent ? { items: [], nextCursor: null }
      : operation === getMyProfile ? { ownerId: 'owner-1', handle: 'owner' }
      : { items: [], nextCursor: null });
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [FeedPage],
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { invoke } },
        { provide: MediaResolver, useValue: { resolve: vi.fn(), sessionRevision: signal(0) } },
        { provide: SessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
        { provide: TokenVault, useValue: { accessToken, registerBeforeSessionChange: () => vi.fn() } },
        { provide: OnlineStatusService, useValue: { isOnline: () => true, isOffline: () => false } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FeedPage);
    fixture.detectChanges(); await fixture.whenStable(); invoke.mockClear();

    accessToken.set(null); fixture.detectChanges(); await Promise.resolve();

    expect(invoke.mock.calls.some(([operation]) => operation === getFeed || operation === listSavedContent || operation === getMyProfile)).toBe(false);
    expect(fixture.componentInstance.items()).toEqual([]);
  });

  it('loads a richer bounded Following page while keeping Discovery on its safe page size', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getFeed ? { items: [], nextCursor: null } : {});
    const page = await mountFeed(invoke);

    expect(invoke).toHaveBeenCalledWith(getFeed, { kind: 'Following', limit: 10, cursor: undefined });
    await page.switchKind('Discovery');
    expect(invoke).toHaveBeenCalledWith(getFeed, { kind: 'Discovery', limit: 5, cursor: undefined });
  });

  it('deduplicates overlapping cursor pages by stable content id', async () => {
    const first = feedItem('same');
    const second = feedItem('second');
    let calls = 0;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation !== getFeed) return {};
      calls += 1;
      return calls === 1
        ? { items: [first], nextCursor: 'next' }
        : { items: [first, second], nextCursor: null };
    });
    const page = await mountFeed(invoke);

    await page.loadMore();

    expect(page.items().map(item => item.content.id)).toEqual(['same', 'second']);
  });

  it('renders the loading state on initial load with no cached items', async () => {
    type Page = { items: FeedItem[]; nextCursor: string | null };
    let resolveLoad: (value: Page) => void = () => {};
    const pending = new Promise<Page>(resolve => { resolveLoad = resolve; });
    const invoke = vi.fn((operation: unknown) => {
      if (operation === getFeed) return pending;
      return Promise.resolve({});
    });
    const page = await mountFeed(invoke);
    expect(page.state()).toBe('loading');
    expect(page.loadError()).toBe(false);
    // Resolve the pending load to empty so the test cleans up.
    resolveLoad({ items: [], nextCursor: null });
    await pending;
  });

  it('transitions to populated when items arrive', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [feedItem('aaa'), feedItem('bbb')], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);
    expect(page.state()).toBe('populated');
    expect(page.visibleItems().length).toBe(2);
  });

  it('shows the Following true-empty variant when the feed has no items', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);
    expect(page.state()).toBe('empty');
    expect(page.emptyVariant()).toBe('following');
  });

  it('shows the Discovery true-empty variant when Discovery has no items', async () => {
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) {
        void params;
        return { items: [], nextCursor: null };
      }
      return {};
    });
    const page = await mountFeed(invoke);
    await page.switchKind('Discovery');
    expect(page.kind()).toBe('Discovery');
    expect(page.state()).toBe('empty');
    expect(page.emptyVariant()).toBe('discovery');
    expect(invoke.mock.calls.some(call => call[0] === getFeed && (call[1] as { kind?: string })?.kind === 'Discovery')).toBe(true);
  });

  it('enters the error state and recovers via retry', async () => {
    let shouldFail = true;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) {
        if (shouldFail) throw new Error('boom');
        return { items: [feedItem('ccc')], nextCursor: null };
      }
      return {};
    });
    const page = await mountFeed(invoke);
    expect(page.state()).toBe('error');
    expect(page.loadError()).toBe(true);

    shouldFail = false;
    await page.retry();
    expect(page.loadError()).toBe(false);
    expect(page.state()).toBe('populated');
  });

  it('keeps cached content as a degraded read when offline', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [feedItem('ddd')], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke, /* offline */ true);
    expect(page.state()).toBe('populated');
    expect(page.degraded()).toBe(true);
    expect(page.isOffline()).toBe(true);
  });

  it('keeps the latest feed mode when an older request finishes later', async () => {
    type Page = { items: FeedItem[]; nextCursor: string | null };
    let holdFollowing = false;
    let resolveFollowing: (value: Page) => void = () => {};
    const pendingFollowing = new Promise<Page>(resolve => { resolveFollowing = resolve; });
    const invoke = vi.fn((operation: unknown, params?: unknown) => {
      if (operation !== getFeed) return Promise.resolve({});
      const kind = (params as { kind?: string } | undefined)?.kind;
      if (kind === 'Following' && holdFollowing) return pendingFollowing;
      return Promise.resolve({
        items: kind === 'Discovery' ? [feedItem('discovery-latest')] : [],
        nextCursor: null
      });
    });
    const page = await mountFeed(invoke);
    await page.switchKind('Discovery');

    holdFollowing = true;
    const olderSwitch = page.switchKind('Following');
    const latestSwitch = page.switchKind('Discovery');
    await latestSwitch;

    expect(page.kind()).toBe('Discovery');
    expect(page.items().map(item => item.content.id)).toEqual(['discovery-latest']);
    resolveFollowing({ items: [feedItem('stale-following')], nextCursor: null });
    await olderSwitch;
    expect(page.items().map(item => item.content.id)).toEqual(['discovery-latest']);
  });
});

describe('FeedPage author identity (VAL-FEED-009)', () => {
  it('uses the embedded author summary and links another author by handle', async () => {
    const item = feedItem('author-summary');
    item.content.authorId = '22222222-2222-2222-2222-222222222222';
    item.author = {
      ownerId: item.content.authorId,
      handle: 'deniz.yilmaz',
      displayName: 'Deniz Yılmaz',
      profileMediaId: 'avatar-id',
      isVerified: true
    };
    const page = await mountFeed(async operation => operation === getFeed
      ? { items: [item], nextCursor: null }
      : {});

    expect(page.authorOf(item)).toEqual({
      authorId: item.content.authorId,
      displayName: 'Deniz Yılmaz',
      handle: 'deniz.yilmaz',
      avatarUrl: '',
      avatarMediaId: 'avatar-id',
      profileHref: '/profil/deniz.yilmaz',
      isViewer: false,
      resolved: true
    });
  });

  it('keeps the honest fallback when the server withholds author identity', async () => {
    const item = feedItem('withheld-author');
    const page = await mountFeed(async operation => operation === getFeed
      ? { items: [item], nextCursor: null }
      : {});

    const identity = page.authorOf(item);
    expect(identity.displayName).toContain('Topluluk');
    expect(identity.profileHref).toBeNull();
    expect(identity.resolved).toBe(false);
  });
});

describe('FeedPage filtered-empty (VAL-FEED-002)', () => {
  it('distinguishes filtered-empty from true-empty and offers reset', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [feedItem('aaa', 'Mimari notu', ['mimari'])], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);
    expect(page.state()).toBe('populated');

    // Apply a filter that matches nothing.
    page.query.set('bulunmayankelime');
    expect(page.hasFilters()).toBe(true);
    expect(page.filteredItems().length).toBe(0);
    expect(page.state()).toBe('filtered-empty');

    // Reset returns to populated (true-empty would stay empty without items).
    page.clearFilters();
    expect(page.hasFilters()).toBe(false);
    expect(page.state()).toBe('populated');
  });

  it('keeps filtering honest: matching query still shows populated', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [feedItem('aaa', 'Mimari notu', ['mimari'])], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);
    page.query.set('mimari');
    expect(page.filteredItems().length).toBe(1);
    expect(page.state()).toBe('populated');
  });

  it('true-empty stays empty even though a filter is active (no items to filter)', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      return {};
    });
    const page = await mountFeed(invoke);
    page.query.set('herhangi');
    // No items at all -> true-empty is the honest state (not filtered-empty).
    expect(page.state()).toBe('empty');
  });
});

describe('FeedPage stream rhythm (VAL-FEED-021)', () => {
  it('inserts a separator every 3 posts, never after the last', () => {
    // Direct logic test: shouldSeparate drives the editorial-cut motif.
    // Build a page instance without bootstrapping the load (ngOnInit fires,
    // but the rhythm helper is a pure function).
    const page = TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [FeedPage],
        providers: [
          { provide: Api, useValue: { invoke: vi.fn(async () => ({ items: [], nextCursor: null })) } },
          { provide: MediaResolver, useValue: { resolve: vi.fn(), sessionRevision: signal(0) } },
          { provide: SessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
          { provide: TokenVault, useValue: { accessToken: () => null, registerBeforeSessionChange: () => vi.fn() } },
          { provide: OnlineStatusService, useValue: { isOnline: () => true, isOffline: () => false } }
        ]
      })
      .createComponent(FeedPage).componentInstance as FeedPage;

    // indices 0..4 (5 items): separators after index 2 (3rd) and index... 5th would be index 4 (last) -> none.
    expect(page.shouldSeparate(0, 5)).toBe(false); // after 1st
    expect(page.shouldSeparate(1, 5)).toBe(false); // after 2nd
    expect(page.shouldSeparate(2, 5)).toBe(true);  // after 3rd
    expect(page.shouldSeparate(3, 5)).toBe(false); // after 4th
    expect(page.shouldSeparate(4, 5)).toBe(false); // last -> never
    // 6 items: separators after 3rd (index 2) only (6 is a multiple of 3 but index 5 is last).
    expect(page.shouldSeparate(5, 6)).toBe(false);
  });

  it('raises only poll-bearing posts, not every post', async () => {
    const plain = feedItem('plain');
    const pollBearing = feedItem('poll');
    pollBearing.hasPoll = true;
    const invoke = vi.fn(async (operation: unknown, params?: unknown) => {
      if (operation === getFeed) return { items: [plain, pollBearing], nextCursor: null };
      if (operation === getPoll) {
        const contentId = (params as { contentId?: string } | undefined)?.contentId;
        return { id: 'p', postId: contentId, question: 'Hangisi?', allowMultiple: false, closesAtUtc: '2026-08-01T00:00:00Z', isOpen: true, options: [], totalVotes: 0 };
      }
      return {};
    });
    const page = await mountFeed(invoke);
    expect(invoke).toHaveBeenCalledWith(getPoll, { contentId: pollBearing.content.id });
    expect(invoke).not.toHaveBeenCalledWith(getPoll, { contentId: plain.content.id });
    expect(page.isRaised(plain)).toBe(false);
    expect(page.isRaised(pollBearing)).toBe(true);
  });
});
