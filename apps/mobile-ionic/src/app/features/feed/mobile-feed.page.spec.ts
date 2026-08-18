import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, createPoll, createPost, FeedItem, getContent, getFeed, getPoll, removeReaction, removeSavedContent, saveContent, setReaction } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MobileMediaResolver } from '../../core/media/mobile-media-resolver.service';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileSessionMediaCleanup } from '../../core/media/mobile-session-media-cleanup.service';
import { MobileFeedPage } from './mobile-feed.page';

function feedItem(id = 'source'): FeedItem {
  return {
    commentCount: 0,
    hasPoll: false,
    content: {
      authorId: '99999999-9999-9999-9999-999999999999',
      hashtags: [],
      id,
      isPinned: false,
      isSensitive: false,
      mediaIds: [],
      mentions: [],
      publishedAtUtc: '2026-07-30T00:00:00Z',
      shareKind: 'Original',
      status: 'Published',
      text: 'Kaynak gönderi',
      version: 1,
      viewCount: 42,
      visibility: 'Public'
    },
    rankingReasons: [],
    reactions: { contentId: id, counts: {}, viewerReaction: null },
    score: 1
  };
}

async function mountFeed(invoke: ReturnType<typeof vi.fn>) {
  await TestBed.configureTestingModule({
    imports: [MobileFeedPage], providers: [
      provideRouter([]),
      { provide: Api, useValue: { invoke } },
      { provide: MobileSession, useValue: { subject: signal('owner-a'), accessToken: signal('owner-token') } },
      { provide: MobileSessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
      { provide: MobileMediaResolver, useValue: { resolve: vi.fn(), sessionRevision: signal(0), authenticated: signal(true) } }
    ]
  }).compileComponents();
  return TestBed.createComponent(MobileFeedPage).componentInstance;
}

describe('MobileFeedPage polls', () => {
  it('publishes a mobile poll through the generated API client', async () => {
    const invoke = vi.fn(async (operation: unknown, _params?: { body?: { options?: unknown[] } }) => {
      if (operation === getFeed) return { items: [], nextCursor: null };
      if (operation === createPost) return { id: '22222222-2222-2222-2222-222222222222' };
      if (operation === createPoll) return { id: 'poll-id' };
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [MobileFeedPage], providers: [
        provideRouter([]),
        { provide: Api, useValue: { invoke } },
        { provide: MobileSession, useValue: { subject: signal('owner-a'), accessToken: signal('owner-token') } },
        { provide: MobileSessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
        { provide: MobileMediaResolver, useValue: { resolve: vi.fn(), sessionRevision: signal(0), authenticated: signal(true) } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(MobileFeedPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.togglePoll();
    page.composer.patchValue({ text: 'Mobil anket', pollQuestion: 'Hangisi?', pollOption1: 'Bir', pollOption2: 'İki' });

    await page.publish();

    expect(invoke.mock.calls.some(call => call[0] === createPost)).toBe(true);
    expect(invoke.mock.calls.some(call => call[0] === createPoll && call[1]?.body?.options?.length === 2)).toBe(true);
  });
});

describe('MobileFeedPage critical feed semantics', () => {
  it('renders authorized post media in the mobile feed', async () => {
    const source=feedItem('mobile-gallery');source.content.mediaIds=['media-a'];
    const invoke=vi.fn(async(operation:unknown)=>operation===getFeed?{items:[source],nextCursor:null}:{});
    const release=vi.fn();const resolve=vi.fn().mockResolvedValue({mediaId:'media-a',url:'blob:mobile-feed',contentType:'image/png',release});
    await TestBed.configureTestingModule({imports:[MobileFeedPage],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject:signal('owner-a'),accessToken:signal('owner-token')}},{provide:MobileSessionMediaCleanup,useValue:{delete:vi.fn().mockResolvedValue(true)}},{provide:MobileMediaResolver,useValue:{resolve,sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileFeedPage);fixture.detectChanges();await fixture.componentInstance.load(false);fixture.detectChanges();
    await vi.waitFor(()=>{fixture.detectChanges();expect(resolve).toHaveBeenCalledWith('media-a',null,expect.any(AbortSignal));});await Promise.resolve();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('zm-mobile-authorized-media-gallery img')?.getAttribute('src')).toBe('blob:mobile-feed');
    fixture.destroy();expect(release).toHaveBeenCalledOnce();
  });

  it('publishes ready media IDs from the primary and quote composers', async () => {
    const source=feedItem('mobile-source');
    const invoke=vi.fn(async(operation:unknown,_params?:unknown)=>operation===getFeed?{items:[],nextCursor:null}:operation===createPost?{id:'created'}:{});
    const page=await mountFeed(invoke);
    page.composerMediaIds.set(['mobile-media']);
    expect(page.canPublish()).toBe(true);
    await page.publish();
    page.openQuote(source);page.quoteText.setValue('Mobil bakış');page.quoteMediaIds.set(['quote-media']);
    await page.publishQuote(source);

    const posts=invoke.mock.calls.filter(call=>call[0]===createPost);
    expect((posts[0][1] as {body:Record<string,unknown>}).body).toMatchObject({text:null,mediaIds:['mobile-media'],shareKind:'Original'});
    expect((posts[1][1] as {body:Record<string,unknown>}).body).toMatchObject({text:'Mobil bakış',mediaIds:['quote-media'],shareKind:'Quote',originalPostId:source.content.id});
  });

  it('loads Discovery with the verified-safe page size', async () => {
    const invoke = vi.fn(async (operation: unknown, _params?: unknown) => operation === getFeed ? { items: [], nextCursor: null } : {});
    const page = await mountFeed(invoke);

    await page.switchKind('Discovery');

    expect(invoke).toHaveBeenCalledWith(getFeed, { kind: 'Discovery', limit: 5, cursor: undefined });
  });

  it('deduplicates overlapping cursor pages before rendering', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getFeed ? {
      items: [feedItem('existing-b'), feedItem('new-c'), feedItem('new-c')],
      nextCursor: null
    } : {});
    const page = await mountFeed(invoke);
    page.items.set([feedItem('existing-a'), feedItem('existing-b')]);
    page.nextCursor.set('next-page');

    await page.load(true);

    expect(page.items().map(item => item.content.id)).toEqual(['existing-a', 'existing-b', 'new-c']);
  });

  it('requests poll details only for feed items marked as polls', async () => {
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

    await page.load(false);

    expect(invoke).toHaveBeenCalledWith(getPoll, { contentId: pollBearing.content.id });
    expect(invoke).not.toHaveBeenCalledWith(getPoll, { contentId: plain.content.id });
    expect(page.polls()[pollBearing.content.id]?.question).toBe('Hangisi?');
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

  it('uses the same collection for save and remove', async () => {
    const invoke = vi.fn(async () => ({}));
    const page = await mountFeed(invoke);

    await page.toggleSaved('content-id');
    await page.toggleSaved('content-id');

    expect(invoke).toHaveBeenNthCalledWith(1, saveContent, { contentId: 'content-id', body: { collection: 'Genel' } });
    expect(invoke).toHaveBeenNthCalledWith(2, removeSavedContent, { contentId: 'content-id', collection: 'Genel' });
  });

  it('removes an existing like and can add it again', async () => {
    const invoke = vi.fn(async () => ({}));
    const page = await mountFeed(invoke);
    const item = feedItem('reacted');
    item.reactions = { contentId: item.content.id, counts: { Like: 2 }, viewerReaction: 'Like' };
    page.items.set([item]);

    await page.react(item);

    expect(invoke).toHaveBeenNthCalledWith(1, removeReaction, { contentId: item.content.id });
    expect(page.items()[0].reactions).toMatchObject({ counts: { Like: 1 }, viewerReaction: null });

    await page.react(page.items()[0]);

    expect(invoke).toHaveBeenNthCalledWith(2, setReaction, { contentId: item.content.id, body: { kind: 'Like' } });
    expect(page.items()[0].reactions).toMatchObject({ counts: { Like: 2 }, viewerReaction: 'Like' });
  });

  it('creates real repost and quote posts for public content', async () => {
    const source = feedItem();
    const invoke = vi.fn(async (operation: unknown, _params?: unknown) => operation === getFeed ? { items: [], nextCursor: null } : {});
    const page = await mountFeed(invoke);

    await page.repost(source);
    page.openQuote(source);
    page.quoteText.setValue('Bu bakış açısı önemli.');
    await page.publishQuote(source);

    const posts = invoke.mock.calls.filter(call => call[0] === createPost);
    expect(posts).toHaveLength(2);
    expect((posts[0][1] as { body: Record<string, unknown> }).body).toMatchObject({ text: null, shareKind: 'Repost', originalPostId: source.content.id });
    expect((posts[1][1] as { body: Record<string, unknown> }).body).toMatchObject({ text: 'Bu bakış açısı önemli.', shareKind: 'Quote', originalPostId: source.content.id });
  });

  it('prevents native navigation when the quote form is submitted', async () => {
    const source = feedItem();
    const invoke = vi.fn(async (operation: unknown) => operation === getFeed ? { items: [], nextCursor: null } : {});
    const page = await mountFeed(invoke);
    const preventDefault = vi.fn();
    page.openQuote(source);
    page.quoteText.setValue('Mobil alıntıyı sayfada yayınla.');

    await page.onQuoteSubmit({ preventDefault } as unknown as Event, source);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(invoke.mock.calls.some(call => call[0] === createPost)).toBe(true);
  });

  it('renders truthful identity and view metadata without author id fragments', async () => {
    const source = feedItem();
    const page = await mountFeed(vi.fn());

    expect(page.authorLabel(source)).toBe('Topluluk üyesi');
    expect(page.authorLabel(source)).not.toContain(source.content.authorId.slice(0, 8));
    expect(page.viewLabel(source.content.viewCount)).toBe('42 görüntülenme');
    source.author = { ownerId: source.content.authorId, handle: 'ayse_dev', displayName: 'Ayşe Yılmaz', profileMediaId: null, isVerified: false };
    expect(page.authorLabel(source)).toBe('Ayşe Yılmaz · @ayse_dev');
  });

  it('resolves shared source content and keeps a truthful unavailable state', async () => {
    const shared = feedItem('share');
    shared.content.shareKind = 'Repost';
    shared.content.originalPostId = 'source';
    shared.content.text = '';
    const source = feedItem('source').content;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getFeed) return { items: [shared], nextCursor: null };
      if (operation === getContent) return source;
      return {};
    });
    const page = await mountFeed(invoke);

    await page.load(false);

    expect(page.originals()[shared.content.id]).toEqual(source);
    expect(invoke).toHaveBeenCalledWith(getContent, { contentId: source.id });
  });
});
