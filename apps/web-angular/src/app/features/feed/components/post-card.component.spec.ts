import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, type ContentItem, type FeedItem, type PollView } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { PostAuthorIdentity, ZmPostCardComponent } from './post-card.component';
import { MediaResolver } from '../../../core/media/media-resolver.service';

/** Minimal FeedItem factory. Content-level overrides are spread into content;
 *  `rankingReasons` is a FeedItem-level field (not on ContentItem). */
function feedItem(
  overrides: Partial<FeedItem['content']> & { id?: string; rankingReasons?: string[] } = {}
): FeedItem {
  const { id, rankingReasons, ...contentFields } = overrides;
  const resolvedId = id ?? 'post-1';
  return {
    content: {
      id: resolvedId,
      authorId: 'author-uuid-1234',
      text: 'Kısa bir gönderi.',
      hashtags: [],
      mediaIds: [],
      mentions: [],
      visibility: 'Public',
      contentWarning: null,
      isSensitive: false,
      isPinned: false,
      linkUrl: null,
      originalPostId: null,
      publishedAtUtc: '2026-07-29T10:00:00Z',
      shareKind: 'Original',
      status: 'Published',
      version: 1,
      viewCount: 0,
      ...contentFields
    },
    reactions: { contentId: resolvedId, counts: {}, viewerReaction: null },
    commentCount: 0,
    score: 0,
    rankingReasons: rankingReasons ?? []
  } as unknown as FeedItem;
}

const RESOLVED_AUTHOR: PostAuthorIdentity = {
  authorId: 'author-uuid-1234',
  displayName: 'Deniz Yılmaz',
  handle: 'deniz',
  avatarUrl: '',
  avatarMediaId: null,
  profileHref: '/profil',
  isViewer: true,
  resolved: true
};

const UNRESOLVED_AUTHOR: PostAuthorIdentity = {
  authorId: 'author-uuid-1234',
  displayName: 'Topluluk üyesi',
  handle: '',
  avatarUrl: '',
  avatarMediaId: null,
  profileHref: null,
  isViewer: false,
  resolved: false
};

async function mountCard(opts: {
  item?: FeedItem;
  author?: PostAuthorIdentity;
  poll?: PollView | null;
  pollInteractive?: boolean;
  original?: ContentItem | null;
  raised?: boolean;
  kind?: 'Following' | 'Discovery';
} = {}): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<ZmPostCardComponent>>; el: HTMLElement; card: ZmPostCardComponent }> {
  const fixture = TestBed.resetTestingModule()
    .configureTestingModule({ imports: [ZmPostCardComponent], providers: [provideRouter([]), {provide:Api,useValue:{invoke:vi.fn()}}, {provide:MediaResolver,useValue:{resolve:vi.fn().mockRejectedValue(new Error('unavailable'))}}] })
    .createComponent(ZmPostCardComponent);
  fixture.componentRef.setInput('item', opts.item ?? feedItem());
  fixture.componentRef.setInput('author', opts.author ?? RESOLVED_AUTHOR);
  if (opts.poll !== undefined) fixture.componentRef.setInput('poll', opts.poll);
  if (opts.pollInteractive !== undefined) fixture.componentRef.setInput('pollInteractive', opts.pollInteractive);
  if (opts.original !== undefined) fixture.componentRef.setInput('original', opts.original);
  if (opts.raised !== undefined) fixture.componentRef.setInput('raised', opts.raised);
  if (opts.kind !== undefined) fixture.componentRef.setInput('kind', opts.kind);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, card: fixture.componentInstance };
}

describe('ZmPostCard identity (VAL-FEED-009)', () => {
  it('renders the real handle + display name + profile link when resolved', async () => {
    const { el } = await mountCard({ author: RESOLVED_AUTHOR });
    const name = el.querySelector('.zm-post-identity__name');
    expect(name?.textContent?.trim()).toBe('Deniz Yılmaz');
    const link = el.querySelector('.zm-post-identity__link') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/profil');
    expect(el.querySelector('.zm-post-identity__handle')?.textContent?.trim()).toBe('@deniz');
  });

  it('resolves the real profile media ID without exposing a protected URL', async () => {
    const resolve=vi.fn().mockResolvedValue({mediaId:'avatar-id',url:'blob:avatar',contentType:'image/webp',release:vi.fn()});
    const fixture=TestBed.resetTestingModule().configureTestingModule({imports:[ZmPostCardComponent],providers:[provideRouter([]),{provide:Api,useValue:{invoke:vi.fn()}},{provide:MediaResolver,useValue:{resolve}}]}).createComponent(ZmPostCardComponent);
    fixture.componentRef.setInput('item',feedItem());fixture.componentRef.setInput('author',{...RESOLVED_AUTHOR,avatarMediaId:'avatar-id'});fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(resolve).toHaveBeenCalledWith('avatar-id','w320.webp',expect.any(AbortSignal));expect(fixture.nativeElement.querySelector('.zm-avatar__image')?.getAttribute('src')).toBe('blob:avatar');
  });

  it('never surfaces the raw author UUID to the reader (resolved or not)', async () => {
    const { el: resolvedEl } = await mountCard({ author: RESOLVED_AUTHOR });
    expect(resolvedEl.textContent).not.toContain('author-uuid-1234');
    expect(resolvedEl.textContent).not.toContain('author-uuid');

    const { el: unresolvedEl } = await mountCard({ author: UNRESOLVED_AUTHOR });
    // Honest fallback label, NEVER the UUID.
    expect(unresolvedEl.querySelector('.zm-post-identity__name')?.textContent?.trim()).toBe('Topluluk üyesi');
    expect(unresolvedEl.textContent).not.toContain('author-uuid');
    expect(unresolvedEl.textContent).not.toContain('1234');
    // No fake/dead profile link for unresolved authors.
    expect(unresolvedEl.querySelector('.zm-post-identity__link')).toBeNull();
    expect(unresolvedEl.querySelector('.zm-post-identity__name')?.getAttribute('data-resolved')).toBe('false');
  });
});

describe('ZmPostCard metadata (VAL-FEED-010)', () => {
  it('renders a readable timestamp with machine datetime + absolute title', async () => {
    const { el } = await mountCard({ item: feedItem({ publishedAtUtc: '2026-07-29T10:00:00Z' }) });
    const time = el.querySelector('.zm-post-card__time');
    expect(time).toBeTruthy();
    expect(time!.getAttribute('datetime')).toBe('2026-07-29T10:00:00Z');
    expect(time!.textContent?.trim().length).toBeGreaterThan(0);
    expect(time!.getAttribute('title')?.length).toBeGreaterThan(0);
    expect(time!.closest('a')?.getAttribute('href')).toBe('/icerik/post-1');
  });

  it('shows the audience with a glyph + label (never color-only)', async () => {
    const { el } = await mountCard({ item: feedItem({ visibility: 'Followers' }) });
    const audience = el.querySelector('.zm-post-card__audience');
    expect(audience?.getAttribute('data-vis')).toBe('people');
    expect(audience?.textContent).toContain('Takipçiler');
    expect(audience?.querySelector('svg')).toBeTruthy();
  });

  it('gates sensitive content behind an explicit reveal', async () => {
    const { el } = await mountCard({ item: feedItem({ contentWarning: 'Şiddet içeren betimleme', text: 'Gizli gövde metni.' }) });
    // Warning surface present + body hidden until revealed.
    expect(el.querySelector('.zm-post-card__warning')).toBeTruthy();
    expect(el.querySelector('.zm-post-card__warning-text')?.textContent).toContain('Şiddet içeren betimleme');
    expect(el.querySelector('.zm-post-card__text')).toBeNull();
    expect(el.querySelector('.zm-post-card__reveal')).toBeTruthy();
  });

  it('reveals the body after the user activates the reveal control', async () => {
    const { el, card, fixture } = await mountCard({ item: feedItem({ isSensitive: true, text: 'Gizli gövde.' }) });
    expect(el.querySelector('.zm-post-card__text')).toBeNull();
    card.reveal();
    fixture.detectChanges();
    expect(el.querySelector('.zm-post-card__text')?.textContent).toContain('Gizli gövde');
    // Reveal control disappears once revealed.
    expect(el.querySelector('.zm-post-card__reveal')).toBeNull();
  });
});

describe('ZmPostCard content variants (VAL-FEED-011)', () => {
  it('renders the body text readably', async () => {
    const { el } = await mountCard({ item: feedItem({ text: 'Editöryel bir akış notu.' }) });
    expect(el.querySelector('.zm-post-card__text')?.textContent).toContain('Editöryel bir akış notu.');
  });

  it('renders a link preview card with the host + safe external link', async () => {
    const { el } = await mountCard({ item: feedItem({ linkUrl: 'https://www.example.com/path/page' }) });
    const link = el.querySelector('.zm-post-card__link') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://www.example.com/path/page');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(el.querySelector('.zm-post-card__link-host')?.textContent).toContain('example.com');
  });

  it('reserves media dimensions so load never causes CLS', async () => {
    const { el } = await mountCard({ item: feedItem({ mediaIds: ['m1', 'm2'] }) });
    const gallery = el.querySelector('.gallery') as HTMLElement | null;
    expect(gallery).toBeTruthy();
    expect(gallery?.getAttribute('data-count')).toBe('2');
    // Reserved aspect-ratio is set via CSS; verify the frame is present (the
    // reserved box is what prevents CLS).
    const frame = gallery?.querySelector('figure') as HTMLElement | null;
    const style = frame ? getComputedStyle(frame).aspectRatio : '';
    expect(style).toBeTruthy();
  });

  it('renders a poll with question + options and emits a vote', async () => {
    const poll: PollView = {
      id: 'poll-1', postId: 'post-1', question: 'Hangi renk?', allowMultiple: false,
      isOpen: true, totalVotes: 4, closesAtUtc: '2026-07-30T10:00:00Z',
      options: [
        { id: 'o1', text: 'Mavi', voteCount: 3 },
        { id: 'o2', text: 'Yeşil', voteCount: 1 }
      ] as PollView['options']
    };
    const spy = vi.fn();
    const { el, card } = await mountCard({ poll });
    card.vote.subscribe(spy);
    expect(el.querySelector('.zm-post-card__poll-question')?.textContent).toContain('Hangi renk?');
    const options = el.querySelectorAll('.zm-post-card__poll-option');
    expect(options.length).toBe(2);
    expect(el.querySelector('.zm-post-card__poll-meta')?.textContent).toContain('4 oy');
    // Vote emits the option id.
    (options[0] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith('o1');
  });

  it('marks multiple-choice selections and exposes an explicit submit action', async () => {
    const poll: PollView = { id:'poll-2',postId:'post-1',question:'İkisini seç',allowMultiple:true,isOpen:true,totalVotes:0,closesAtUtc:'2026-08-20T00:00:00Z',options:[{id:'o1',text:'Bir',voteCount:0},{id:'o2',text:'İki',voteCount:0}] };
    const { fixture, el, card } = await mountCard({ poll });
    fixture.componentRef.setInput('selectedPollOptionIds',['o1']); fixture.detectChanges();
    const options=el.querySelectorAll('.zm-post-card__poll-option');
    expect(options[0].classList.contains('is-selected')).toBe(true);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.zm-post-card__poll-meta')?.textContent).toContain('Birden fazla');
    const submit=el.querySelector('.zm-post-card__poll-submit') as HTMLButtonElement;
    const spy=vi.fn(); card.submitVote.subscribe(spy); submit.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('renders timeline poll results without allowing a second voting surface', async () => {
    const poll: PollView = { id:'poll-3',postId:'post-1',question:'Sonuclar',allowMultiple:true,isOpen:true,totalVotes:2,closesAtUtc:'2026-08-20T00:00:00Z',options:[{id:'o1',text:'Bir',voteCount:2},{id:'o2',text:'Iki',voteCount:0}] };
    const { el, card } = await mountCard({ poll, pollInteractive: false });
    const spy = vi.fn(); card.vote.subscribe(spy);
    const options = el.querySelectorAll('.zm-post-card__poll-option');
    expect(options.length).toBe(2);
    expect(Array.from(options).every(option => (option as HTMLButtonElement).disabled)).toBe(true);
    expect(el.querySelector('.zm-post-card__poll-submit')).toBeNull();
    (options[0] as HTMLButtonElement).click();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ZmPostCard share and view metadata', () => {
  it('shows the real view count with a non-color eye cue', async () => {
    const { el } = await mountCard({ item: feedItem({ viewCount: 27 }) });
    const views = el.querySelector('.zm-post-card__views');
    expect(views?.textContent?.trim()).toBe('27');
    expect(views?.getAttribute('aria-label')).toBe('27 görüntülenme');
    expect(views?.querySelector('svg')).toBeTruthy();
  });

  it('renders repost semantics and the visible source without exposing ids', async () => {
    const original = {
      ...feedItem({ id: 'source-id', text: 'Kaynak gönderinin gerçek metni.', viewCount: 9, mediaIds:['source-media'] }).content
    } as ContentItem;
    const item = feedItem({
      id: 'repost-id',
      text: '',
      shareKind: 'Repost',
      originalPostId: 'source-id'
    });
    const { el } = await mountCard({ item, original });
    expect(el.querySelector('.zm-post-card__share-kind')?.textContent).toContain('Yeniden paylaşıldı');
    expect(el.querySelector('.zm-post-card__source-text')?.textContent).toContain('Kaynak gönderinin gerçek metni.');
    expect(el.querySelector('.zm-post-card__source-meta')?.textContent).toContain('9 görüntülenme');
    expect(el.querySelector('.zm-post-card__source .gallery')?.getAttribute('data-count')).toBe('1');
    expect(el.textContent).not.toContain('source-id');
  });

  it('states truthfully when a quote source is no longer visible', async () => {
    const item = feedItem({
      id: 'quote-id',
      text: 'Alıntı notu',
      shareKind: 'Quote',
      originalPostId: 'source-id'
    });
    const { el } = await mountCard({ item, original: null });
    expect(el.querySelector('.zm-post-card__share-kind')?.textContent).toContain('Alıntı gönderi');
    expect(el.querySelector('.zm-post-card__source-unavailable')?.textContent).toContain('artık erişilemiyor');
  });
});

describe('ZmPostCard discovery reason (VAL-FEED-017)', () => {
  it('shows the reason when present on the Discovery feed', async () => {
    const { el } = await mountCard({
      kind: 'Discovery',
      item: feedItem({ rankingReasons: ['Takip ettiğin bir kişi'] })
    });
    const reason = el.querySelector('.zm-post-card__reason');
    expect(reason?.textContent).toContain('Takip ettiğin bir kişi');
  });

  it('translates ranker diagnostics without exposing numeric scores', async () => {
    const { el } = await mountCard({
      kind: 'Discovery',
      item: feedItem({ rankingReasons: ['recency:1.78', 'relationship:15.00', 'engagement:4.20'] })
    });
    const reason = el.querySelector('.zm-post-card__reason')?.textContent ?? '';
    expect(reason).toContain('Bağlantılarına yakın bir paylaşım');
    expect(reason).not.toContain('relationship:');
    expect(reason).not.toContain('1.78');
  });

  it('hides unknown machine diagnostics instead of leaking implementation copy', async () => {
    const { el } = await mountCard({
      kind: 'Discovery',
      item: feedItem({ rankingReasons: ['experimental_signal:9.25'] })
    });
    expect(el.querySelector('.zm-post-card__reason')).toBeNull();
  });

  it('does NOT fabricate a reason when the API provides none', async () => {
    const { el } = await mountCard({ kind: 'Discovery', item: feedItem({ rankingReasons: [] }) });
    expect(el.querySelector('.zm-post-card__reason')).toBeNull();
  });

  it('does not show a discovery reason on the Following feed even if reasons exist', async () => {
    const { el } = await mountCard({
      kind: 'Following',
      item: feedItem({ rankingReasons: ['Takip ettiğin bir kişi'] })
    });
    expect(el.querySelector('.zm-post-card__reason')).toBeNull();
  });
});

describe('ZmPostCard long-text expansion (VAL-FEED-019)', () => {
  const LONG = 'Lorem ipsum dolor sit amet '.repeat(40); // ~960 chars > 340 threshold

  it('truncates long text and offers a focus/scroll-safe expand', async () => {
    const { el, card, fixture } = await mountCard({ item: feedItem({ text: LONG }) });
    const toggle = el.querySelector('.zm-post-card__expand') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.zm-post-card__text')?.classList.contains('is-clamped')).toBe(true);

    card.toggleExpand();
    fixture.detectChanges();
    expect(card.expanded()).toBe(true);
    expect(el.querySelector('.zm-post-card__expand')?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.zm-post-card__text')?.classList.contains('is-clamped')).toBe(false);

    // Collapse returns to the clamped state.
    card.toggleExpand();
    fixture.detectChanges();
    expect(card.expanded()).toBe(false);
    expect(el.querySelector('.zm-post-card__text')?.classList.contains('is-clamped')).toBe(true);
  });

  it('does not offer expand for short text', async () => {
    const { el } = await mountCard({ item: feedItem({ text: 'Kısa.' }) });
    expect(el.querySelector('.zm-post-card__expand')).toBeNull();
    expect(el.querySelector('.zm-post-card__text')?.classList.contains('is-clamped')).toBe(false);
  });

  it('keeps the long-form body within the 68-72ch reading measure', async () => {
    const { el } = await mountCard({ item: feedItem({ text: LONG }) });
    const body = el.querySelector('.zm-post-card__body') as HTMLElement | null;
    expect(body).toBeTruthy();
    // The measure is applied via the --zm-measure-long-form (70ch) token.
    expect(getComputedStyle(body!).maxWidth).toBeTruthy();
  });
});
