import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, StoryView, createStory, deleteStory, getStory, listActiveStories, listProfileStories } from '@platform/api';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileMediaResolver } from '../../core/media/mobile-media-resolver.service';
import { MobileStoryRailComponent } from './mobile-story-rail.component';

const story=(id='story-a',ownerId='owner-a'):StoryView=>({id,ownerId,mediaId:`media-${id}`,caption:'Akşam ışığı',audience:'Public',status:'Active',createdAtUtc:'2026-08-14T07:00:00Z',expiresAtUtc:'2026-08-15T07:00:00Z',version:1,author:{ownerId,handle:ownerId,displayName:ownerId==='owner-a'?'Ayşe':'Bora',profileMediaId:null,isVerified:false}});
beforeAll(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()})});});

async function mount(invoke:ReturnType<typeof vi.fn>,subject=signal<string|null>('owner-a'),mediaRevision=signal(0),resolve=vi.fn()){
  await TestBed.configureTestingModule({imports:[MobileStoryRailComponent],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject,accessToken:signal<string|null>('owner-token')}},{provide:MobileMediaResolver,useValue:{resolve,sessionRevision:mediaRevision}}]}).compileComponents();
  const fixture=TestBed.createComponent(MobileStoryRailComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return{fixture,component:fixture.componentInstance,subject,mediaRevision};
}

describe('MobileStoryRailComponent',()=>{
  it('loads real Stories and resolves authorized viewer media with a non-color viewed cue',async()=>{
    const current=story();const release=vi.fn();const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?{items:[current],nextCursor:null}:operation===getStory?current:null);const resolve=vi.fn().mockResolvedValue({mediaId:current.mediaId,url:'blob:mobile-story',contentType:'image/png',release});
    const{fixture,component}=await mount(invoke,signal('viewer'),signal(0),resolve);component.openStory(0);await vi.waitFor(()=>expect(resolve).toHaveBeenCalledWith(current.mediaId,null,expect.any(AbortSignal)));fixture.detectChanges();
    expect(component.viewerMedia()?.url).toBe('blob:mobile-story');expect(component.viewedIds().has(current.id)).toBe(true);expect(fixture.nativeElement.querySelector('.story-tile')?.textContent).toContain('Görüldü');component.closeViewer();expect(release).toHaveBeenCalledOnce();
  });

  it('groups an author into one ring and keeps segmented navigation inside that author',async()=>{
    const first=story('a-new','owner-a');const second={...story('a-old','owner-a'),createdAtUtc:'2026-08-14T06:00:00Z'};const other=story('b-only','owner-b');const stories=[first,second,other];const invoke=vi.fn(async(operation:unknown,params?:{id?:string})=>operation===listActiveStories?{items:stories,nextCursor:null}:operation===getStory?stories.find(item=>item.id===params?.id):null);const resolve=vi.fn().mockImplementation(async(mediaId:string)=>({mediaId,url:`blob:${mediaId}`,contentType:'image/png',release:vi.fn()}));
    const{fixture,component}=await mount(invoke,signal('viewer'),signal(0),resolve);expect(fixture.nativeElement.querySelectorAll('.story-tile')).toHaveLength(2);expect(fixture.nativeElement.querySelector('.story-count')?.textContent).toContain('2');component.openAuthor(component.authorGroups()[0].stories);await vi.waitFor(()=>expect(component.viewerState()).toBe('ready'));expect(component.selectedAuthorStories()).toHaveLength(2);component.move(1);await vi.waitFor(()=>expect(component.selectedStory()?.id).toBe(second.id));expect(component.selectedStory()?.ownerId).toBe('owner-a');expect(component.selectedAuthorPosition()).toBe(1);
  });

  it('creates exactly one real Story and preserves the server-returned item',async()=>{
    const created=story('created');const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?{items:[],nextCursor:null}:operation===createStory?created:null);const{component}=await mount(invoke);
    Object.defineProperty(component,'storyPicker',{value:()=>({transfer:()=>({ids:['ready-private-media'],discard:vi.fn(),discardWithAccessToken:vi.fn(),rollback:vi.fn()})})});component.storyMediaIds.set(['ready-private-media']);component.caption.setValue('Mobil an');component.audience.setValue('Followers');
    await component.publish();
    expect(invoke).toHaveBeenCalledWith(createStory,{body:{mediaId:'ready-private-media',caption:'Mobil an',audience:'Followers'}});expect(component.items()[0].id).toBe(created.id);
  });

  it('reconciles an ambiguous create response before allowing media rollback',async()=>{
    const committed=story('committed-after-timeout');let lists=0;const rollback=vi.fn();const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?(++lists===1?{items:[],nextCursor:null}:{items:[committed],nextCursor:null}):operation===createStory?Promise.reject(new Error('response lost')):null);const{component}=await mount(invoke);
    Object.defineProperty(component,'storyPicker',{value:()=>({transfer:()=>({ids:[committed.mediaId],discard:vi.fn(),discardWithAccessToken:vi.fn(),rollback})})});component.storyMediaIds.set([committed.mediaId]);
    await component.publish();
    expect(component.items()[0]?.id).toBe(committed.id);expect(rollback).not.toHaveBeenCalled();
  });

  it('uses the old account token to clean an unclaimed transfer after an account switch',async()=>{
    let rejectCreate!:(reason?:unknown)=>void;const pending=new Promise<StoryView>((_resolve,reject)=>rejectCreate=reject);const subject=signal<string|null>('owner-a');const discardWithAccessToken=vi.fn().mockResolvedValue(true);const rollback=vi.fn();const invoke=vi.fn((operation:unknown)=>operation===listActiveStories?Promise.resolve({items:[],nextCursor:null}):operation===createStory?pending:Promise.resolve(null));const{fixture,component}=await mount(invoke,subject);
    Object.defineProperty(component,'storyPicker',{value:()=>({transfer:()=>({ids:['old-owner-media'],discard:vi.fn(),discardWithAccessToken,rollback})})});component.storyMediaIds.set(['old-owner-media']);const publishing=component.publish();subject.set('owner-b');fixture.detectChanges();await Promise.resolve();rejectCreate(new Error('offline'));await publishing;
    expect(discardWithAccessToken).toHaveBeenCalledWith('owner-token');expect(rollback).not.toHaveBeenCalled();
  });

  it('unblocks the new account without letting the old publish clear its busy state',async()=>{
    let rejectA!:(reason?:unknown)=>void;let resolveB!:(value:StoryView)=>void;const pendingA=new Promise<StoryView>((_resolve,reject)=>rejectA=reject);const pendingB=new Promise<StoryView>(resolve=>resolveB=resolve);let creates=0;const subject=signal<string|null>('owner-a');const invoke=vi.fn((operation:unknown)=>operation===listActiveStories?Promise.resolve({items:[],nextCursor:null}):operation===createStory?(++creates===1?pendingA:pendingB):Promise.resolve(null));const{fixture,component}=await mount(invoke,subject);const discardA=vi.fn().mockResolvedValue(true);let transferId='media-a';Object.defineProperty(component,'storyPicker',{value:()=>({transfer:()=>({ids:[transferId],discard:vi.fn(),discardWithAccessToken:discardA,rollback:vi.fn()})})});component.storyMediaIds.set([transferId]);const publishA=component.publish();subject.set('owner-b');fixture.detectChanges();await vi.waitFor(()=>expect(component.publishing()).toBe(false));transferId='media-b';component.storyMediaIds.set([transferId]);const publishB=component.publish();expect(component.publishing()).toBe(true);rejectA(new Error('old request failed'));await publishA;expect(component.publishing()).toBe(true);resolveB(story('story-b','owner-b'));await publishB;expect(component.publishing()).toBe(false);expect(discardA).toHaveBeenCalledWith('owner-token');
  });

  it('keeps expiry/privacy failure recoverable instead of exposing stale media',async()=>{
    const current=story();const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?{items:[current],nextCursor:null}:operation===getStory?Promise.reject(new Error('expired')):null);const{component}=await mount(invoke);component.openStory(0);await vi.waitFor(()=>expect(component.viewerState()).toBe('unavailable'));expect(component.viewerMedia()).toBeNull();
  });

  it('supports owner deletion only after the server succeeds',async()=>{
    const current=story();const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?{items:[current],nextCursor:null}:operation===getStory?current:operation===deleteStory?undefined:null);const resolve=vi.fn().mockResolvedValue({mediaId:current.mediaId,url:'blob:owner-story',contentType:'image/png',release:vi.fn()});const{component}=await mount(invoke,signal('owner-a'),signal(0),resolve);component.openStory(0);await vi.waitFor(()=>expect(component.viewerState()).toBe('ready'));await component.removeSelected();expect(invoke).toHaveBeenCalledWith(deleteStory,{id:current.id});expect(component.items()).toEqual([]);
  });

  it('clears old-account tiles and closes revoked viewer bytes before a delayed replacement',async()=>{
    const current=story();let resolveB!:(value:{items:StoryView[];nextCursor:null})=>void;const delayedB=new Promise<{items:StoryView[];nextCursor:null}>(resolve=>resolveB=resolve);const invoke=vi.fn((operation:unknown)=>operation===listActiveStories?(invoke.mock.calls.filter(call=>call[0]===listActiveStories).length===1?Promise.resolve({items:[current],nextCursor:null}):delayedB):operation===getStory?Promise.resolve(current):Promise.resolve(null));const release=vi.fn();const subject=signal<string|null>('owner-a');const{fixture,component}=await mount(invoke,subject,signal(0),vi.fn().mockResolvedValue({mediaId:current.mediaId,url:'blob:a',contentType:'image/png',release}));component.openStory(0);await vi.waitFor(()=>expect(component.viewerState()).toBe('ready'));subject.set('owner-b');fixture.detectChanges();await Promise.resolve();expect(component.items()).toEqual([]);expect(component.viewerOpen()).toBe(false);expect(release).toHaveBeenCalledOnce();resolveB({items:[story('story-b','owner-b')],nextCursor:null});await vi.waitFor(()=>expect(component.items()[0]?.id).toBe('story-b'));
  });

  it('uses the profile-scoped Story contract when an owner is supplied',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===listProfileStories?{items:[story()],nextCursor:null}:{items:[],nextCursor:null});await TestBed.configureTestingModule({imports:[MobileStoryRailComponent],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject:signal('viewer'),accessToken:signal('token')}},{provide:MobileMediaResolver,useValue:{resolve:vi.fn(),sessionRevision:signal(0)}}]}).compileComponents();const fixture=TestBed.createComponent(MobileStoryRailComponent);fixture.componentRef.setInput('ownerId','owner-a');fixture.componentRef.setInput('allowCreate',false);fixture.detectChanges();await fixture.whenStable();expect(invoke).toHaveBeenCalledWith(listProfileStories,{ownerId:'owner-a',limit:20,cursor:undefined});
  });

  it('returns focus after native viewer and composer dismissal paths',async()=>{
    const current=story();const invoke=vi.fn(async(operation:unknown)=>operation===listActiveStories?{items:[current],nextCursor:null}:operation===getStory?Promise.reject(new Error('unavailable')):null);const{component}=await mount(invoke);const origin=document.createElement('button');document.body.appendChild(origin);const focus=vi.spyOn(origin,'focus');
    component.openStory(0,{currentTarget:origin} as unknown as Event);component.viewerDismissed();await vi.waitFor(()=>expect(focus).toHaveBeenCalledTimes(1));component.openComposer({currentTarget:origin} as unknown as Event);Object.defineProperty(component,'storyPicker',{value:()=>({discard:vi.fn().mockResolvedValue(undefined)})});component.composerDismissed();await vi.waitFor(()=>expect(focus).toHaveBeenCalledTimes(2));origin.remove();
  });
});
