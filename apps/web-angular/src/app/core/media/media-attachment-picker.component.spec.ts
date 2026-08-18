import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, MediaView, deleteMedia, initiateMedia, uploadMediaContent } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from './media-resolver.service';
import { TokenVault } from '../auth/token-vault.service';
import { MediaAttachmentPickerComponent } from './media-attachment-picker.component';
import { SessionMediaCleanup } from './session-media-cleanup.service';

const readyMedia = (id = 'media-1'): MediaView => ({
  id,
  fileName: `${id}.png`,
  contentType: 'image/png',
  size: 10,
  visibility: 'Public',
  status: 'Ready',
  urls: { 'w960.webp': `/api/v1/media/${id}/download?variant=w960.webp` },
  createdAtUtc: '2026-08-13T12:00:00Z',
  version: 3,
});

async function mount(invoke: ReturnType<typeof vi.fn>, resolve = vi.fn(), cleanupDelete = vi.fn().mockResolvedValue(true)) {
  const mediaRevision=signal(0);
  let beforeSessionChange: (accessToken: string | null) => Promise<unknown> | unknown = () => undefined;
  await TestBed.configureTestingModule({
    imports: [MediaAttachmentPickerComponent],
    providers: [
      { provide: Api, useValue: { invoke } },
      { provide: MediaResolver, useValue: { resolve, sessionRevision: mediaRevision } },
      { provide: SessionMediaCleanup, useValue: { delete: cleanupDelete } },
      { provide: TokenVault, useValue: {
        accessToken: () => 'old-owner-token',
        registerBeforeSessionChange: (callback: typeof beforeSessionChange) => { beforeSessionChange = callback; return vi.fn(); },
      } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MediaAttachmentPickerComponent);
  fixture.componentRef.setInput('visibility', 'Public');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, changeSession: (token = 'old-owner-token') => beforeSessionChange(token), cleanupDelete, rotateMedia:()=>mediaRevision.update(value=>value+1) };
}

function fileEvent(files: File[]): Event {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', { value: files });
  return { target: input } as unknown as Event;
}

describe('MediaAttachmentPickerComponent', () => {
  it('uploads real bytes, resolves an authorized preview and emits media IDs', async () => {
    const media = readyMedia();
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === initiateMedia) return { media: { ...media, status: 'Pending' }, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' };
      if (operation === uploadMediaContent) return media;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: media.id, url: 'blob:preview', contentType: 'image/webp', size: 8, release });
    const { fixture, component } = await mount(invoke, resolve);
    const emitted: string[][] = [];
    const busy: boolean[] = [];
    component.mediaIdsChange.subscribe(ids => emitted.push(ids));
    component.uploadingChange.subscribe(value => busy.push(value));

    await component.chooseFiles(fileEvent([new File(['image'], media.fileName, { type: media.contentType })]));
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(initiateMedia, { body: expect.objectContaining({ visibility: 'Public' }) });
    expect(invoke).toHaveBeenCalledWith(uploadMediaContent, { id: media.id, body: expect.any(File) });
    expect(resolve).toHaveBeenCalledWith(media.id, 'w960.webp', expect.any(AbortSignal));
    expect(emitted.at(-1)).toEqual([media.id]);
    expect(busy).toEqual([true, false]);
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:preview');
  });

  it('rejects unsupported or oversized files before initiating an upload', async () => {
    const invoke = vi.fn();
    const { fixture, component } = await mount(invoke);

    await component.chooseFiles(fileEvent([new File(['text'], 'notes.txt', { type: 'text/plain' })]));
    fixture.detectChanges();

    expect(invoke).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('desteklenmiyor');
  });

  it('supports a one-image profile boundary without accepting video', async () => {
    const invoke = vi.fn();
    const { fixture, component } = await mount(invoke);
    fixture.componentRef.setInput('maxFiles', 1);
    fixture.componentRef.setInput('imagesOnly', true);
    fixture.detectChanges();

    await component.chooseFiles(fileEvent([new File(['video'], 'avatar.mp4', { type: 'video/mp4' })]));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(false);
    expect(input.accept).not.toContain('video/mp4');
    expect(invoke).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('JPEG, PNG veya WebP');
  });

  it('excludes an attachment from transfer while its deletion is in flight', async () => {
    const media = readyMedia();
    let finishDelete!: () => void;
    const deleting = new Promise<void>(resolve => { finishDelete = resolve; });
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === initiateMedia) return { media, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' };
      if (operation === uploadMediaContent) return media;
      if (operation === deleteMedia) return deleting;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: media.id, url: 'blob:preview', contentType: 'image/png', size: 8, release });
    const { component } = await mount(invoke, resolve);
    const emitted: string[][] = [];
    component.mediaIdsChange.subscribe(ids => emitted.push(ids));
    await component.chooseFiles(fileEvent([new File(['image'], media.fileName, { type: media.contentType })]));

    const removal = component.remove(media.id);

    expect(invoke).toHaveBeenCalledWith(deleteMedia, { id: media.id });
    expect(emitted.at(-1)).toEqual([]);
    expect(component.transfer().ids).toEqual([]);
    finishDelete();
    await removal;
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases but does not delete committed media when the picker is destroyed', async () => {
    const media = readyMedia();
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === initiateMedia) return { media, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' };
      if (operation === uploadMediaContent) return media;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: media.id, url: 'blob:preview', contentType: 'image/png', size: 8, release });
    const { component } = await mount(invoke, resolve);
    await component.chooseFiles(fileEvent([new File(['image'], media.fileName, { type: media.contentType })]));

    component.commit();
    component.ngOnDestroy();

    expect(release).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith(deleteMedia, expect.anything());
  });

  it('transfers deletion ownership before an in-flight post and cleans only when requested', async () => {
    const media = readyMedia('transferred');
    const invoke = vi.fn(async (operation: unknown) => operation === initiateMedia
      ? { media, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' }
      : operation === uploadMediaContent ? media : undefined);
    const release = vi.fn();
    const { component } = await mount(invoke, vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:transfer',contentType:'image/png',release}));
    await component.chooseFiles(fileEvent([new File(['image'], media.fileName, {type:media.contentType})]));

    const transfer = component.transfer();
    component.ngOnDestroy();

    expect(transfer.ids).toEqual([media.id]);
    expect(release).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith(deleteMedia, {id:media.id});
    await expect(transfer.discard()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith(deleteMedia, {id:media.id});
  });

  it('restores a transferred attachment when post creation fails',async()=>{
    const media=readyMedia('retryable');const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const resolve=vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:retry',contentType:'image/png',size:8,release:vi.fn()});
    const{component}=await mount(invoke,resolve);await component.chooseFiles(fileEvent([new File(['image'],media.fileName,{type:media.contentType})]));
    const transfer=component.transfer();await transfer.rollback();
    expect(component.attachments().map(item=>item.media.id)).toEqual([media.id]);expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('deletes ready unclaimed media with the departing account before clearing the picker', async () => {
    const media = readyMedia('departing');
    const invoke = vi.fn(async (operation: unknown) => operation === initiateMedia
      ? { media, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' }
      : operation === uploadMediaContent ? media : undefined);
    const release = vi.fn();
    const cleanupDelete = vi.fn().mockResolvedValue(true);
    const { component, changeSession } = await mount(invoke, vi.fn().mockResolvedValue({
      mediaId: media.id, url: 'blob:departing', contentType: 'image/png', size: 8, release,
    }), cleanupDelete);
    await component.chooseFiles(fileEvent([new File(['image'], media.fileName, { type: media.contentType })]));

    await changeSession();

    expect(component.attachments()).toEqual([]);
    expect(cleanupDelete).toHaveBeenCalledWith([media.id], 'old-owner-token');
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases and resolves previews again after a same-account token rotation',async()=>{
    const media=readyMedia('rotated');const firstRelease=vi.fn();const secondRelease=vi.fn();
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const resolve=vi.fn().mockResolvedValueOnce({mediaId:media.id,url:'blob:first',contentType:'image/png',release:firstRelease}).mockResolvedValueOnce({mediaId:media.id,url:'blob:second',contentType:'image/png',release:secondRelease});
    const{fixture,component,rotateMedia}=await mount(invoke,resolve);await component.chooseFiles(fileEvent([new File(['image'],media.fileName,{type:media.contentType})]));
    rotateMedia();fixture.detectChanges();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledTimes(2));
    expect(firstRelease).toHaveBeenCalledOnce();expect(component.attachments()[0]?.preview?.url).toBe('blob:second');component.ngOnDestroy();expect(secondRelease).toHaveBeenCalledOnce();
  });
});
