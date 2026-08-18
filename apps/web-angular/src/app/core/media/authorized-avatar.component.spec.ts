import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from './media-resolver.service';
import { AuthorizedAvatarComponent } from './authorized-avatar.component';
import { AuthorizedProfileVisualComponent } from './authorized-profile-visual.component';

describe('authorized profile media', () => {
  it('renders an authorized avatar variant and releases it on destroy', async () => {
    const release=vi.fn();const resolve=vi.fn().mockResolvedValue({mediaId:'avatar',url:'blob:avatar',contentType:'image/webp',release});
    await TestBed.configureTestingModule({imports:[AuthorizedAvatarComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedAvatarComponent);fixture.componentRef.setInput('name','Ayşe');fixture.componentRef.setInput('mediaId','avatar');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(resolve).toHaveBeenCalledWith('avatar','w320.webp',expect.any(AbortSignal));expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:avatar');fixture.destroy();expect(release).toHaveBeenCalledOnce();
  });

  it('renders and releases an authorized cover while retaining the honest fallback on failure', async () => {
    const release=vi.fn();const resolve=vi.fn(async(id:string,variant:string|null)=>id==='cover'?{mediaId:id,url:'blob:cover',contentType:'image/webp',release}:Promise.reject(new Error(String(variant))));
    await TestBed.configureTestingModule({imports:[AuthorizedProfileVisualComponent],providers:[{provide:MediaResolver,useValue:{resolve}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedProfileVisualComponent);fixture.componentRef.setInput('name','Ayşe');fixture.componentRef.setInput('coverMediaId','cover');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.profile-cover img')?.getAttribute('src')).toBe('blob:cover');fixture.destroy();expect(release).toHaveBeenCalledOnce();
  });

  it('clears and releases an active avatar before resolving it for a changed session', async () => {
    const sessionRevision=signal(0);const release=vi.fn();
    const resolve=vi.fn().mockResolvedValueOnce({mediaId:'avatar',url:'blob:account-a',contentType:'image/webp',size:5,release}).mockRejectedValue(new Error('account-b forbidden'));
    await TestBed.configureTestingModule({imports:[AuthorizedAvatarComponent],providers:[{provide:MediaResolver,useValue:{resolve,sessionRevision}}]}).compileComponents();
    const fixture=TestBed.createComponent(AuthorizedAvatarComponent);fixture.componentRef.setInput('name','Ayse');fixture.componentRef.setInput('mediaId','avatar');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:account-a');
    sessionRevision.update(value=>value+1);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(release).toHaveBeenCalledOnce();expect(fixture.nativeElement.querySelector('img')).toBeNull();expect(resolve).toHaveBeenCalledTimes(2);
  });
});
