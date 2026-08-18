import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe,expect,it,vi } from 'vitest';
import { MobileAuthorizedMediaGalleryComponent } from './mobile-authorized-media-gallery.component';
import { MobileMediaResolver } from './mobile-media-resolver.service';

describe('MobileAuthorizedMediaGalleryComponent',()=>{
  it('renders authorized media and releases its lease',async()=>{
    const release=vi.fn();const resolve=vi.fn().mockResolvedValue({mediaId:'m',url:'blob:mobile-gallery',contentType:'image/png',release});
    await TestBed.configureTestingModule({imports:[MobileAuthorizedMediaGalleryComponent],providers:[{provide:MobileMediaResolver,useValue:{resolve,sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileAuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['m']);fixture.componentRef.setInput('label','Profil fotoğrafı');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')?.getAttribute('aria-label')).toBe('Profil fotoğrafı');expect(fixture.nativeElement.querySelector('img')?.getAttribute('alt')).toBe('Profil fotoğrafı');expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:mobile-gallery');fixture.destroy();expect(release).toHaveBeenCalledOnce();
  });

  it('aborts a pending download on destroy',async()=>{
    let observedSignal:AbortSignal|undefined;const resolve=vi.fn((_id:string,_variant:string|null,signal:AbortSignal)=>new Promise((_accept,reject)=>{observedSignal=signal;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});}));
    await TestBed.configureTestingModule({imports:[MobileAuthorizedMediaGalleryComponent],providers:[{provide:MobileMediaResolver,useValue:{resolve,sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileAuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['large']);fixture.detectChanges();expect(observedSignal?.aborted).toBe(false);fixture.destroy();expect(observedSignal?.aborted).toBe(true);
  });

  it('releases and clears active media before resolving it for a changed session',async()=>{
    const revision=signal(0);const authenticated=signal(true);const releaseA=vi.fn();const releaseB=vi.fn();const resolve=vi.fn()
      .mockResolvedValueOnce({mediaId:'m',url:'blob:account-a',contentType:'image/png',release:releaseA})
      .mockResolvedValueOnce({mediaId:'m',url:'blob:account-b',contentType:'image/png',release:releaseB});
    await TestBed.configureTestingModule({imports:[MobileAuthorizedMediaGalleryComponent],providers:[{provide:MobileMediaResolver,useValue:{resolve,sessionRevision:revision,authenticated}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileAuthorizedMediaGalleryComponent);fixture.componentRef.setInput('mediaIds',['m']);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:account-a');
    revision.update(value=>value+1);fixture.detectChanges();expect(releaseA).toHaveBeenCalledOnce();expect(fixture.nativeElement.querySelector('img')).toBeNull();
    await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:account-b');fixture.destroy();expect(releaseB).toHaveBeenCalledOnce();
  });
});
