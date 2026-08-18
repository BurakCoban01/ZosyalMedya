import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  Api,
  listSavedContent,
  removeSavedContent,
  saveContent,
  SavedContentView
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { SavedPage } from './saved.page';

const SAVED_MEDIA: SavedContentView = {
  collection: 'Genel',
  content: {
    authorId: 'author-id',
    contentWarning: 'Yoğun ışık içerir',
    hashtags: ['tasarım'],
    id: 'content-id',
    isPinned: false,
    isSensitive: true,
    linkUrl: 'https://example.com/read',
    mediaIds: ['media-id'],
    mentions: [],
    publishedAtUtc: '2026-07-30T06:00:00Z',
    shareKind: 'Original',
    status: 'Published',
    text: '',
    version: 1,
    viewCount: 3,
    visibility: 'Public'
  },
  id: 'saved-id',
  savedAtUtc: '2026-07-30T06:00:00Z'
};

async function renderSaved(invoke: ReturnType<typeof vi.fn>) {
  const release=vi.fn();
  await TestBed.configureTestingModule({
    imports: [SavedPage],
    providers: [provideRouter([]), { provide: Api, useValue: { invoke } }, {provide:MediaResolver,useValue:{resolve:vi.fn().mockResolvedValue({mediaId:'media-id',url:'blob:saved',contentType:'image/png',size:5,release})}}]
  }).compileComponents();
  const fixture = TestBed.createComponent(SavedPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('SavedPage personal-library states', () => {
  it('renders honest media and content context without a raw author id', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listSavedContent) return { items: [SAVED_MEDIA], nextCursor: null };
      return {};
    });
    const fixture = await renderSaved(invoke);
    await vi.waitFor(()=>{fixture.detectChanges();expect(fixture.nativeElement.querySelector('zm-authorized-media-gallery img')?.getAttribute('src')).toBe('blob:saved');});

    expect(fixture.nativeElement.textContent).toContain('Metinsiz medya paylaşımı');
    expect(fixture.nativeElement.textContent).not.toContain('önizlemesi bu yanıtta bulunmuyor');
    expect(fixture.nativeElement.textContent).toContain('Özgün gönderi');
    expect(fixture.nativeElement.textContent).toContain('Yoğun ışık içerir');
    expect(fixture.nativeElement.textContent).not.toContain('author-id');
    expect(fixture.nativeElement.querySelector('a[href="https://example.com/read"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/icerik/content-id"]')?.textContent).toContain('Gönderiyi aç');
  });

  it('removes from the exact real collection and exposes undo', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listSavedContent) return { items: [SAVED_MEDIA], nextCursor: null };
      if (operation === removeSavedContent) return undefined;
      return {};
    });
    const fixture = await renderSaved(invoke);

    await fixture.componentInstance.remove(SAVED_MEDIA);
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(removeSavedContent, {
      contentId: 'content-id',
      collection: 'Genel'
    });
    expect(fixture.componentInstance.items()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Geri al');
  });

  it('uses the real save operation for undo and reloads the server record', async () => {
    const restored = { ...SAVED_MEDIA, id: 'restored-id', savedAtUtc: '2026-07-30T07:00:00Z' };
    let listCalls = 0;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listSavedContent) {
        listCalls += 1;
        return { items: listCalls === 1 ? [SAVED_MEDIA] : [restored], nextCursor: null };
      }
      return undefined;
    });
    const fixture = await renderSaved(invoke);
    await fixture.componentInstance.remove(SAVED_MEDIA);

    await fixture.componentInstance.undoRemove();
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(saveContent, {
      contentId: 'content-id',
      body: { collection: 'Genel' }
    });
    expect(fixture.componentInstance.items()[0].id).toBe('restored-id');
    expect(fixture.nativeElement.textContent).toContain('Kayıt yeniden eklendi.');
  });

  it('rolls the exact list back when removal fails', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listSavedContent) return { items: [SAVED_MEDIA], nextCursor: null };
      if (operation === removeSavedContent) throw new Error('conflict');
      return {};
    });
    const fixture = await renderSaved(invoke);

    await fixture.componentInstance.remove(SAVED_MEDIA);
    fixture.detectChanges();

    expect(fixture.componentInstance.items()).toEqual([SAVED_MEDIA]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent)
      .toContain('görünüm geri alındı');
  });

  it('shows recoverable load failure instead of a false empty library', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const fixture = await renderSaved(invoke);

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent)
      .toContain('Kaydedilenler yüklenemedi');
    expect(fixture.nativeElement.textContent).toContain('Tekrar dene');
    expect(fixture.nativeElement.textContent).not.toContain('Henüz kayıt yok');
  });
});
