import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizedMediaGalleryComponent } from './authorized-media-gallery.component';
import { MediaResolver } from './media-resolver.service';

describe('AuthorizedMediaGalleryComponent', () => {
  it('renders authorized image and video blobs and releases both on destroy', async () => {
    const releases = [vi.fn(), vi.fn()];
    const resolve = vi.fn()
      .mockResolvedValueOnce({ mediaId:'image',url:'blob:image',contentType:'image/png',release:releases[0] })
      .mockResolvedValueOnce({ mediaId:'video',url:'blob:video',contentType:'video/mp4',release:releases[1] });
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);
    fixture.componentRef.setInput('mediaIds',['image','video']);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:image');
    expect(fixture.nativeElement.querySelector('source')?.getAttribute('src')).toBe('blob:video');
    fixture.destroy();expect(releases.every(release=>release.mock.calls.length===1)).toBe(true);
  });

  it('offers an honest retry after an authorization failure', async () => {
    const resolve=vi.fn().mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({mediaId:'m',url:'blob:m',contentType:'image/webp',release:vi.fn()});
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['m']);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const retry=fixture.nativeElement.querySelector('button') as HTMLButtonElement;expect(retry.textContent).toContain('Yeniden dene');retry.click();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeTruthy();expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('aborts an abandoned download when the gallery is destroyed', async () => {
    let observedSignal: AbortSignal | undefined;
    const resolve=vi.fn((_id:string,_variant:string|null,signal:AbortSignal)=>new Promise((_accept,reject)=>{
      observedSignal=signal;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    }));
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['large']);fixture.detectChanges();
    expect(observedSignal?.aborted).toBe(false);fixture.destroy();expect(observedSignal?.aborted).toBe(true);
  });

  it('opens a keyboard-navigable viewer without resolving the same bytes again', async () => {
    const resolve=vi.fn()
      .mockResolvedValueOnce({mediaId:'one',url:'blob:one',contentType:'image/png',release:vi.fn()})
      .mockResolvedValueOnce({mediaId:'two',url:'blob:two',contentType:'video/mp4',release:vi.fn()});
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['one','two']);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const trigger=fixture.nativeElement.querySelector('.media-trigger') as HTMLButtonElement;trigger.focus();trigger.click();fixture.detectChanges();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));fixture.detectChanges();
    expect(fixture.componentInstance.selectedIndex()).toBe(0);expect(fixture.nativeElement.querySelector('dialog[open] img')?.getAttribute('src')).toBe('blob:one');
    const key=new KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true});fixture.componentInstance.viewerKeydown(key);fixture.detectChanges();
    expect(key.defaultPrevented).toBe(true);expect(fixture.componentInstance.selectedIndex()).toBe(1);expect(fixture.nativeElement.querySelector('dialog source')?.getAttribute('src')).toBe('blob:two');expect(resolve).toHaveBeenCalledTimes(2);
    const video=fixture.nativeElement.querySelector('dialog video') as HTMLVideoElement;const videoKey=new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});video.dispatchEvent(videoKey);fixture.detectChanges();
    expect(videoKey.defaultPrevented).toBe(false);expect(fixture.componentInstance.selectedIndex()).toBe(1);
    fixture.componentInstance.closeViewer();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));expect(fixture.componentInstance.selectedIndex()).toBeNull();expect(document.activeElement).toBe(trigger);
  });

  it('does not navigate into a still-pending media slot', async () => {
    let finishSecond!: (value: unknown) => void;
    const second=new Promise(resolve=>{finishSecond=resolve;});
    const resolve=vi.fn()
      .mockResolvedValueOnce({mediaId:'one',url:'blob:one',contentType:'image/png',release:vi.fn()})
      .mockReturnValueOnce(second);
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['one','pending']);fixture.detectChanges();await vi.waitFor(()=>expect(fixture.componentInstance.resolvedCount()).toBe(1));fixture.detectChanges();
    fixture.componentInstance.openViewer(0,new Event('click'));fixture.componentInstance.move(1);fixture.detectChanges();
    expect(fixture.componentInstance.selectedIndex()).toBe(0);expect(fixture.nativeElement.querySelector('.viewer-panel')).toBeTruthy();expect(fixture.nativeElement.querySelector('.viewer nav')).toBeNull();
    finishSecond({mediaId:'pending',url:'blob:pending',contentType:'image/png',release:vi.fn()});await fixture.whenStable();fixture.destroy();
  });

  it('invalidates a scheduled viewer open when it is closed before the next frame', async () => {
    let frame: FrameRequestCallback | undefined;
    const frameSpy=vi.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 1;});
    const resolve=vi.fn().mockResolvedValue({mediaId:'one',url:'blob:one',contentType:'image/png',release:vi.fn()});
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['one']);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    fixture.componentInstance.openViewer(0,new Event('click'));fixture.componentInstance.closeViewer();frame?.(performance.now());fixture.detectChanges();
    expect(fixture.componentInstance.selectedIndex()).toBeNull();expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
    frameSpy.mockRestore();fixture.destroy();
  });

  it('closes, releases and reloads media when the resolver session changes',async()=>{
    const revision=signal(0);const firstRelease=vi.fn();const secondRelease=vi.fn();const resolve=vi.fn().mockResolvedValueOnce({mediaId:'one',url:'blob:first',contentType:'image/png',release:firstRelease}).mockResolvedValueOnce({mediaId:'one',url:'blob:second',contentType:'image/png',release:secondRelease});
    await TestBed.configureTestingModule({imports:[AuthorizedMediaGalleryComponent],providers:[{provide:MediaResolver,useValue:{resolve,sessionRevision:revision}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['one']);fixture.detectChanges();await vi.waitFor(()=>expect(fixture.componentInstance.resolvedCount()).toBe(1));fixture.componentInstance.openViewer(0,new Event('click'));revision.update(value=>value+1);fixture.detectChanges();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledTimes(2));
    expect(firstRelease).toHaveBeenCalledOnce();expect(fixture.componentInstance.selectedIndex()).toBeNull();expect(fixture.componentInstance.items()[0]?.media?.url).toBe('blob:second');fixture.destroy();expect(secondRelease).toHaveBeenCalledOnce();
  });
});
