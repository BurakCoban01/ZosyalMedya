import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, MediaView, deleteMedia, initiateMedia, uploadMediaContent } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MobileMediaAttachmentPickerComponent } from './mobile-media-attachment-picker.component';
import { MobileMediaResolver } from './mobile-media-resolver.service';
import { MobileSession } from '../auth/secure-token-storage';
import { MobileSessionMediaCleanup } from './mobile-session-media-cleanup.service';

const media: MediaView = {
  id:'mobile-media',fileName:'mobil.png',contentType:'image/png',size:5,visibility:'Public',status:'Ready',
  urls:{'w960.webp':'/api/v1/media/mobile-media/download?variant=w960.webp'},createdAtUtc:'2026-08-13T12:00:00Z',version:3
};

function fileEvent(file:File):Event{const input=document.createElement('input');Object.defineProperty(input,'files',{value:[file]});return{target:input}as unknown as Event;}

async function mount(invoke:ReturnType<typeof vi.fn>,resolve=vi.fn()){
  const cleanup=vi.fn().mockResolvedValue(true);
  const subject=signal<string|null>('owner-a');
  const sessionRevision=signal(0);
  await TestBed.configureTestingModule({imports:[MobileMediaAttachmentPickerComponent],providers:[
    {provide:Api,useValue:{invoke}},{provide:MobileMediaResolver,useValue:{resolve,sessionRevision}},
    {provide:MobileSession,useValue:{subject,accessToken:signal('owner-token')}},
    {provide:MobileSessionMediaCleanup,useValue:{delete:cleanup}}
  ]}).compileComponents();
  const fixture=TestBed.createComponent(MobileMediaAttachmentPickerComponent);fixture.detectChanges();
  return{fixture,component:fixture.componentInstance,cleanup,subject,sessionRevision};
}

describe('MobileMediaAttachmentPickerComponent',()=>{
  it('uploads and resolves a real authorized preview',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media:{...media,status:'Pending'},uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const release=vi.fn();const resolve=vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:mobile',contentType:'image/webp',release});
    const{fixture,component}=await mount(invoke,resolve);const ids:string[][]=[];component.mediaIdsChange.subscribe(value=>ids.push(value));

    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(initiateMedia,{body:expect.objectContaining({visibility:'Public'})});
    expect(invoke).toHaveBeenCalledWith(uploadMediaContent,{id:media.id,body:expect.any(File)});
    expect(resolve).toHaveBeenCalledWith(media.id,'w960.webp',expect.any(AbortSignal));expect(ids.at(-1)).toEqual([media.id]);
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('blob:mobile');
  });

  it('honors the private visibility boundary required by message attachments',async()=>{
    const privateMedia={...media,visibility:'Private' as const};
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media:privateMedia,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?privateMedia:undefined);
    const{fixture,component}=await mount(invoke,vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:private',contentType:'image/png',release:vi.fn()}));
    fixture.componentRef.setInput('visibility','Private');fixture.detectChanges();
    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));
    expect(invoke).toHaveBeenCalledWith(initiateMedia,{body:expect.objectContaining({visibility:'Private'})});
  });

  it('rejects unsupported files before the API call',async()=>{
    const invoke=vi.fn();const{fixture,component}=await mount(invoke);
    await component.choose(fileEvent(new File(['x'],'x.txt',{type:'text/plain'})));fixture.detectChanges();
    expect(invoke).not.toHaveBeenCalled();expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('desteklenmiyor');
  });

  it('deletes removed media and preserves committed media',async()=>{
    let finishDelete!:()=>void;const deleting=new Promise<void>(resolve=>{finishDelete=resolve;});
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:operation===deleteMedia?deleting:undefined);
    const release=vi.fn();const resolve=vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:mobile',contentType:'image/png',release});
    const{component}=await mount(invoke,resolve);await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));
    const removal=component.remove(media.id);
    expect(invoke).toHaveBeenCalledWith(deleteMedia,{id:media.id});expect(component.transfer().ids).toEqual([]);finishDelete();await removal;expect(release).toHaveBeenCalledOnce();

    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));component.commit();component.ngOnDestroy();
    expect(invoke.mock.calls.filter(call=>call[0]===deleteMedia)).toHaveLength(1);
  });

  it('transfers media before teardown and leaves rollback cleanup to the caller',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const release=vi.fn();const{component}=await mount(invoke,vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:mobile',contentType:'image/png',release}));
    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));
    const transfer=component.transfer();component.ngOnDestroy();
    expect(transfer.ids).toEqual([media.id]);expect(release).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith(deleteMedia,{id:media.id});
    await expect(transfer.discard()).resolves.toBe(true);expect(invoke).toHaveBeenCalledWith(deleteMedia,{id:media.id});
  });

  it('restores transferred media when post creation fails',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const resolve=vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:mobile',contentType:'image/png',release:vi.fn()});
    const{component}=await mount(invoke,resolve);await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));
    const transfer=component.transfer();await transfer.rollback();
    expect(component.attachments().map(item=>item.media.id)).toEqual([media.id]);expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('clears old-account drafts and deletes them with the token that created them',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);
    const release=vi.fn();const{fixture,component,cleanup,subject}=await mount(invoke,vi.fn().mockResolvedValue({mediaId:media.id,url:'blob:old-owner',contentType:'image/png',release}));
    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));
    subject.set('owner-b');fixture.detectChanges();await vi.waitFor(()=>expect(component.attachments()).toEqual([]));
    expect(release).toHaveBeenCalledOnce();expect(cleanup).toHaveBeenCalledWith([media.id],'owner-token');
  });

  it('releases and re-resolves previews after same-account token rotation',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);const releaseA=vi.fn();const releaseB=vi.fn();const resolve=vi.fn().mockResolvedValueOnce({mediaId:media.id,url:'blob:token-a',contentType:'image/png',release:releaseA}).mockResolvedValueOnce({mediaId:media.id,url:'blob:token-b',contentType:'image/png',release:releaseB});const{fixture,component,sessionRevision}=await mount(invoke,resolve);
    await component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));sessionRevision.update(value=>value+1);fixture.detectChanges();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledTimes(2));
    expect(releaseA).toHaveBeenCalledOnce();expect(component.attachments()[0].preview?.url).toBe('blob:token-b');fixture.destroy();expect(releaseB).toHaveBeenCalledOnce();
  });

  it('does not let a late old-account upload clear the new account progress state',async()=>{
    const mediaB={...media,id:'mobile-media-b',fileName:'b.png'};let resolveA!:(value:unknown)=>void;let resolveB!:(value:MediaView)=>void;const pendingA=new Promise(resolve=>resolveA=resolve);const pendingB=new Promise<MediaView>(resolve=>resolveB=resolve);let initiateCount=0;const invoke=vi.fn((operation:unknown,params?:{id?:string})=>operation===initiateMedia?(++initiateCount===1?pendingA:Promise.resolve({media:mediaB,uploadUrl:'/upload-b',expiresAtUtc:'2026-08-13T13:00:00Z'})):operation===uploadMediaContent&&params?.id===mediaB.id?pendingB:Promise.resolve(undefined));const{fixture,component,subject}=await mount(invoke,vi.fn().mockResolvedValue({mediaId:mediaB.id,url:'blob:b',contentType:'image/png',release:vi.fn()}));
    const oldChoose=component.choose(fileEvent(new File(['a'],'a.png',{type:'image/png'})));await vi.waitFor(()=>expect(invoke).toHaveBeenCalledWith(initiateMedia,expect.anything()));subject.set('owner-b');fixture.detectChanges();await vi.waitFor(()=>expect(component.uploading()).toBe(false));const newChoose=component.choose(fileEvent(new File(['b'],'b.png',{type:'image/png'})));await vi.waitFor(()=>expect(invoke).toHaveBeenCalledWith(uploadMediaContent,{id:mediaB.id,body:expect.any(File)}));resolveA({media,uploadUrl:'/upload-a',expiresAtUtc:'2026-08-13T13:00:00Z'});await oldChoose;
    expect(component.uploading()).toBe(true);expect(component.pending()).toEqual(['b.png']);resolveB(mediaB);await newChoose;expect(component.uploading()).toBe(false);
  });

  it('releases a delayed pre-refresh preview instead of overwriting the fresh lease',async()=>{
    let resolveOld!:(value:unknown)=>void;const oldPending=new Promise(resolve=>resolveOld=resolve);const oldRelease=vi.fn();const freshRelease=vi.fn();const resolve=vi.fn().mockReturnValueOnce(oldPending).mockResolvedValueOnce({mediaId:media.id,url:'blob:fresh',contentType:'image/png',release:freshRelease});const invoke=vi.fn(async(operation:unknown)=>operation===initiateMedia?{media,uploadUrl:'/upload',expiresAtUtc:'2026-08-13T13:00:00Z'}:operation===uploadMediaContent?media:undefined);const{fixture,component,sessionRevision}=await mount(invoke,resolve);
    const choosing=component.choose(fileEvent(new File(['image'],media.fileName,{type:media.contentType})));await vi.waitFor(()=>expect(component.attachments()).toHaveLength(1));sessionRevision.update(value=>value+1);fixture.detectChanges();await vi.waitFor(()=>expect(component.attachments()[0].preview?.url).toBe('blob:fresh'));resolveOld({mediaId:media.id,url:'blob:revoked-old',contentType:'image/png',release:oldRelease});await choosing;
    expect(oldRelease).toHaveBeenCalledOnce();expect(component.attachments()[0].preview?.url).toBe('blob:fresh');fixture.destroy();expect(freshRelease).toHaveBeenCalledOnce();
  });
});
