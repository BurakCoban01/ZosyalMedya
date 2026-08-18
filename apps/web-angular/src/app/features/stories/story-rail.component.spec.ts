import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  Api,
  StoryView,
  createStory,
  deleteStory,
  getMyProfile,
  getStory,
  listActiveStories,
  listProfileStories,
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { StoryRailComponent } from './story-rail.component';

const story = (id = 'story-1'): StoryView => ({
  id,
  ownerId: 'owner-1',
  mediaId: `media-${id}`,
  caption: 'Akşam ışığı',
  audience: 'Followers',
  status: 'Active',
  author: { ownerId: 'owner-1', handle: 'ayseyilmaz', displayName: 'Ayşe Yılmaz', isVerified: false, profileMediaId: null },
  createdAtUtc: '2026-08-14T12:00:00Z',
  expiresAtUtc: '2026-08-15T12:00:00Z',
  version: 1,
});

const tokenFor = (subject: string) => `x.${btoa(JSON.stringify({ sub: subject })).replace(/=/g, '')}.x`;
const token = tokenFor('owner-1');

async function mount(
  invoke: ReturnType<typeof vi.fn>,
  resolve = vi.fn(),
  accessToken = signal<string | null>(token),
  mediaSessionRevision = signal(0),
) {
  await TestBed.configureTestingModule({
    imports: [StoryRailComponent],
    providers: [
      provideRouter([]),
      { provide: Api, useValue: { invoke } },
      { provide: MediaResolver, useValue: { resolve, sessionRevision: mediaSessionRevision } },
      { provide: TokenVault, useValue: { accessToken } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(StoryRailComponent);
  fixture.detectChanges();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith(listActiveStories, expect.any(Object)));
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('StoryRailComponent', () => {
  it('loads real stories, resolves authorized media and records a non-color viewed label', async () => {
    const current = story();
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listActiveStories) return { items: [current], nextCursor: null };
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      if (operation === getStory) return current;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: current.mediaId, url: 'blob:story', contentType: 'image/png', size: 20, release });
    const { fixture, component } = await mount(invoke, resolve);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));
    fixture.detectChanges();

    const tile = fixture.nativeElement.querySelector('.story-tile') as HTMLButtonElement;
    expect(tile.textContent).toContain('1 yeni');
    component.openStory(0, { currentTarget: tile } as unknown as Event);
    await vi.waitFor(() => expect(component.viewerState()).toBe('ready'));
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(getStory, { id: current.id });
    expect(resolve).toHaveBeenCalledWith(current.mediaId, null, expect.any(AbortSignal));
    expect(fixture.nativeElement.querySelector('.story-viewer img')?.getAttribute('src')).toBe('blob:story');
    expect(component.viewedIds().has(current.id)).toBe(true);
    expect(fixture.nativeElement.querySelector('.story-tile')?.textContent).toContain('Görüldü');
    component.closeViewer();
    expect(release).toHaveBeenCalledOnce();
  });

  it('renders one rail ring per author and navigates only that author\'s segmented sequence', async () => {
    const first = story('author-1-new');
    const second = { ...story('author-1-old'), createdAtUtc: '2026-08-14T11:00:00Z' };
    const other = { ...story('author-2'), ownerId: 'owner-2', author: {
      ...story().author, ownerId: 'owner-2', handle: 'zeynepkaya', displayName: 'Zeynep Kaya',
    }};
    const stories = [first, second, other];
    const invoke = vi.fn(async (operation: unknown, params?: { id?: string }) => {
      if (operation === listActiveStories) return { items: stories, nextCursor: null };
      if (operation === getMyProfile) return { ownerId: 'viewer' };
      if (operation === getStory) return stories.find(item => item.id === params?.id);
      return undefined;
    });
    const resolve = vi.fn().mockImplementation(async (mediaId: string) => ({
      mediaId, url: `blob:${mediaId}`, contentType: 'image/png', size: 20, release: vi.fn(),
    }));
    const { fixture, component } = await mount(invoke, resolve);
    await vi.waitFor(() => expect(component.items()).toHaveLength(3));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.story-tile')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.story-tile__count')?.textContent).toContain('2');
    component.openAuthor(component.authorGroups()[0].stories);
    await vi.waitFor(() => expect(component.viewerState()).toBe('ready'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.story-viewer__segments span')).toHaveLength(2);

    component.move(1);
    await vi.waitFor(() => expect(component.selectedStory()?.id).toBe(second.id));
    expect(component.selectedStory()?.ownerId).toBe('owner-1');
    expect(component.selectedAuthorPosition()).toBe(1);
  });

  it('publishes exactly one private uploaded media ID with the selected audience', async () => {
    const created = story('created-story');
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listActiveStories) return { items: [], nextCursor: null };
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      if (operation === createStory) return created;
      return undefined;
    });
    const { component } = await mount(invoke);
    component.storyMediaIds.set(['ready-private-media']);
    component.caption.setValue('  Kısa bir an  ');
    component.audience.setValue('CloseFriends');

    await component.publish(new Event('submit'));

    expect(invoke).toHaveBeenCalledWith(createStory, { body: {
      mediaId: 'ready-private-media', caption: 'Kısa bir an', audience: 'CloseFriends',
    }});
    expect(component.items()[0]?.id).toBe(created.id);
  });

  it('keeps the viewer recoverable when a story expires or becomes private before opening', async () => {
    const current = story();
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listActiveStories) return { items: [current], nextCursor: null };
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      if (operation === getStory) throw new Error('not visible');
      return undefined;
    });
    const { fixture, component } = await mount(invoke);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));

    component.openStory(0);
    await vi.waitFor(() => expect(component.viewerState()).toBe('unavailable'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('artık görüntülenemiyor');
  });

  it('removes an owner story only after the real delete succeeds', async () => {
    const current = story();
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listActiveStories) return { items: [current], nextCursor: null };
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      if (operation === getStory) return current;
      if (operation === deleteStory) return undefined;
      return undefined;
    });
    const resolve = vi.fn().mockResolvedValue({ mediaId: current.mediaId, url: 'blob:story', contentType: 'image/png', size: 20, release: vi.fn() });
    const { component } = await mount(invoke, resolve);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));
    component.openStory(0);
    await vi.waitFor(() => expect(component.viewerState()).toBe('ready'));

    await component.confirmDelete();

    expect(invoke).toHaveBeenCalledWith(deleteStory, { id: current.id });
    expect(component.items()).toEqual([]);
  });

  it('releases and closes an active private viewer before an account change can render it', async () => {
    const current = story();
    let activeCalls = 0;
    let resolveReplacement!: (value: { items: StoryView[]; nextCursor: null }) => void;
    const replacement = new Promise<{ items: StoryView[]; nextCursor: null }>(resolve => { resolveReplacement = resolve; });
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listActiveStories) return ++activeCalls === 1 ? { items: [current], nextCursor: null } : replacement;
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      if (operation === getStory) return current;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: current.mediaId, url: 'blob:story', contentType: 'image/png', size: 20, release });
    const accessToken = signal<string | null>(token);
    const { fixture, component } = await mount(invoke, resolve, accessToken);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));
    component.openStory(0);
    await vi.waitFor(() => expect(component.viewerState()).toBe('ready'));

    accessToken.set(tokenFor('owner-2'));
    fixture.detectChanges();

    expect(component.items()).toEqual([]);
    expect(component.selectedStory()).toBeNull();
    expect(component.viewerState()).toBe('idle');
    expect(component.resolvedMedia()).toBeNull();
    expect(release).toHaveBeenCalledOnce();
    resolveReplacement({ items: [], nextCursor: null });
    await replacement;
  });

  it('clears profile-scoped tiles before a delayed replacement profile list resolves', async () => {
    const current = story();
    let resolveSecond!: (value: { items: StoryView[]; nextCursor: null }) => void;
    const second = new Promise<{ items: StoryView[]; nextCursor: null }>(resolve => { resolveSecond = resolve; });
    const invoke = vi.fn(async (operation: unknown, params?: { ownerId?: string }) => {
      if (operation === listActiveStories) return { items: [current], nextCursor: null };
      if (operation === listProfileStories && params?.ownerId === 'owner-2') return second;
      if (operation === getMyProfile) return { ownerId: 'owner-1' };
      return undefined;
    });
    const { fixture, component } = await mount(invoke);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));

    fixture.componentRef.setInput('ownerId', 'owner-2');
    fixture.detectChanges();

    expect(component.items()).toEqual([]);
    expect(component.nextCursor()).toBeNull();
    resolveSecond({ items: [], nextCursor: null });
    await second;
  });

  it('closes an active viewer when the resolver revokes URLs for a same-account token rotation', async () => {
    const current = story();
    const invoke = vi.fn(async (operation: unknown) => operation === listActiveStories
      ? { items: [current], nextCursor: null }
      : operation === getStory ? current
      : operation === getMyProfile ? { ownerId: 'owner-1' }
      : undefined);
    const release = vi.fn();
    const mediaSessionRevision = signal(0);
    const { fixture, component } = await mount(invoke, vi.fn().mockResolvedValue({
      mediaId: current.mediaId, url: 'blob:story', contentType: 'image/png', size: 20, release,
    }), signal(token), mediaSessionRevision);
    await vi.waitFor(() => expect(component.items()).toHaveLength(1));
    component.openStory(0);
    await vi.waitFor(() => expect(component.viewerState()).toBe('ready'));

    mediaSessionRevision.update(value => value + 1);
    fixture.detectChanges();

    expect(component.selectedStory()).toBeNull();
    expect(component.resolvedMedia()).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });

  it('cleans a confirmed-uncommitted transfer with the old session when create fails after an account switch', async () => {
    let rejectCreate!: (reason: unknown) => void;
    const pendingCreate = new Promise<StoryView>((_resolve, reject) => { rejectCreate = reject; });
    const invoke = vi.fn(async (operation: unknown) => operation === listActiveStories
      ? { items: [], nextCursor: null }
      : operation === getMyProfile ? { ownerId: 'owner-1' }
      : operation === createStory ? pendingCreate
      : undefined);
    const accessToken = signal<string | null>(token);
    const { fixture, component } = await mount(invoke, vi.fn(), accessToken);
    const discardWithAccessToken = vi.fn().mockResolvedValue(true);
    Object.defineProperty(component, 'storyPicker', { value: () => ({ transfer: () => ({
      ids: ['old-owner-media'], discard: vi.fn(), rollback: vi.fn(), discardWithAccessToken,
    }) }) });
    component.storyMediaIds.set(['old-owner-media']);

    const publishing = component.publish(new Event('submit'));
    accessToken.set(tokenFor('owner-2'));
    fixture.detectChanges();
    expect(component.publishing()).toBe(false);
    rejectCreate(new Error('create failed'));
    await publishing;

    expect(discardWithAccessToken).toHaveBeenCalledWith(token);
    expect(component.items()).toEqual([]);
  });
});
