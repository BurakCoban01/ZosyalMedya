import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Api, getCommunityBySlug, getContent, getFeed, getProfileByHandle, getQuestion, getSocialGraphSummary, listComments } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { MobileMediaResolver } from '../../core/media/mobile-media-resolver.service';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { routes } from '../../app.routes';
import { MobileCommunityDetailPage } from './mobile-community-detail.page';
import { MobileContentDetailPage } from './mobile-content-detail.page';
import { MobileProfileDetailPage } from './mobile-profile-detail.page';
import { MobileQuestionDetailPage } from './mobile-question-detail.page';

function routeParam(name:string,value:string){const paramMap={get:(key:string)=>key===name?value:null};return{snapshot:{paramMap},paramMap:of(paramMap)};}
async function render<T>(component:Type<T>,route:object,invoke:ReturnType<typeof vi.fn>){
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({imports:[component],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:route},{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject:signal('owner-a'),accessToken:signal('owner-token')}},{provide:MobileMediaResolver,useValue:{resolve:vi.fn().mockRejectedValue(new Error('media unavailable')),sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
  const fixture=TestBed.createComponent(component);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return fixture;
}

describe('Ionic deep detail parity',()=>{
  it('owns the four authenticated deep routes inside the native tabs shell',()=>{
    const children=routes.find(route=>route.path==='')?.children??[];
    expect(children.map(route=>route.path)).toEqual(expect.arrayContaining(['profil/:handle','icerik/:id','sorular/:id','topluluklar/:slug']));
  });

  it('renders a public profile with real social summary, timeline and authorized profile media',async()=>{
    const profile={id:'profile',ownerId:'owner',handle:'demo_user',displayName:'Demo User',biography:'Dolu profil',location:'İstanbul',organization:'Zosyal',websiteUrl:null,profileMediaId:'avatar',coverMediaId:'cover',isPrivate:false,isVerified:true,theme:'System',language:'Turkish',reduceMotion:false,completenessPercentage:100,version:1};
    const post={content:{id:'post',authorId:'owner',text:'Gerçek gönderi',visibility:'Public',status:'Published',shareKind:'Original',originalPostId:null,mediaIds:[],mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-14T00:00:00Z',version:1,viewCount:3},author:null,reactions:{contentId:'post',counts:{},viewerReaction:null},commentCount:0,hasPoll:false,rankingReasons:[],score:0};
    const invoke=vi.fn(async(operation:unknown)=>operation===getProfileByHandle?profile:operation===getFeed?{items:[post],nextCursor:null,strategy:'profile'}:operation===getSocialGraphSummary?{ownerId:'owner',followerCount:4,followingCount:3,pendingRequestCount:0,canManageRequests:false}:null);
    const fixture=await render(MobileProfileDetailPage,routeParam('handle','demo_user'),invoke);
    expect(fixture.nativeElement.textContent).toContain('Demo User');expect(fixture.nativeElement.textContent).toContain('4 takipçi');expect(fixture.nativeElement.textContent).toContain('Gerçek gönderi');
    expect(fixture.nativeElement.querySelectorAll('zm-mobile-authorized-media-gallery')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('a[href^="/baglantilar?profil=demo_user"]')).toBeTruthy();
  });

  it('loads visible content and comments through the real contracts',async()=>{
    const content={id:'post',authorId:'owner',text:'Ayrıntılı gönderi',visibility:'Public',status:'Published',shareKind:'Original',originalPostId:null,mediaIds:['media'],mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-14T00:00:00Z',version:1,viewCount:7};
    const comment={id:'comment',contentId:'post',authorId:'other',parentId:null,depth:0,text:'Gerçek yorum',mentions:[],status:'Visible',createdAtUtc:'2026-08-14T00:00:00Z',version:1,author:{ownerId:'other',handle:'ayse',displayName:'Ayşe',profileMediaId:null,isVerified:false},canManage:false};
    const invoke=vi.fn(async(operation:unknown)=>operation===getContent?content:operation===listComments?{items:[comment],nextCursor:null}:null);
    const fixture=await render(MobileContentDetailPage,routeParam('id','post'),invoke);
    expect(fixture.nativeElement.textContent).toContain('Ayrıntılı gönderi');expect(fixture.nativeElement.textContent).toContain('Gerçek yorum');expect(invoke).toHaveBeenCalledWith(getContent,{contentId:'post'});
  });

  it('clears route A immediately and ignores its delayed completion after an A to B reuse',async()=>{
    const maps=new BehaviorSubject<{get:(key:string)=>string|null}>({get:(key:string)=>key==='id'?'a':null});let releaseA!:(value:unknown)=>void;const delayedA=new Promise(resolve=>releaseA=resolve);
    const content=(id:string,text:string)=>({id,authorId:'owner',text,visibility:'Public',status:'Published',shareKind:'Original',originalPostId:null,mediaIds:[],mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-14T00:00:00Z',version:1,viewCount:1});
    const invoke=vi.fn((operation:unknown,params?:{contentId?:string})=>operation===getContent?(params?.contentId==='a'?delayedA:Promise.resolve(content('b','B içeriği'))):Promise.resolve({items:[],nextCursor:null}));
    TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[MobileContentDetailPage],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{snapshot:{paramMap:maps.value},paramMap:maps.asObservable()}},{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject:signal('owner-a'),accessToken:signal('owner-token')}},{provide:MobileMediaResolver,useValue:{resolve:vi.fn(),sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileContentDetailPage);fixture.detectChanges();await Promise.resolve();
    maps.next({get:(key:string)=>key==='id'?'b':null});fixture.detectChanges();await Promise.resolve();await Promise.resolve();await Promise.resolve();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('B içeriği');
    releaseA(content('a','A gizli kalmalı'));await Promise.resolve();await Promise.resolve();fixture.detectChanges();expect(fixture.nativeElement.textContent).not.toContain('A gizli kalmalı');expect(fixture.nativeElement.textContent).toContain('B içeriği');
  });

  it('keeps anonymous question identity absent while rendering its answer',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===getQuestion?{id:'q',targetId:'owner',senderId:null,body:'Anonim soru',isAnonymous:true,audience:'Public',status:'Answered',answer:'Güvenli yanıt',publishAtUtc:null,answeredAtUtc:'2026-08-14T00:00:00Z',createdAtUtc:'2026-08-14T00:00:00Z',version:2}:null);
    const fixture=await render(MobileQuestionDetailPage,routeParam('id','q'),invoke);
    expect(fixture.nativeElement.textContent).toContain('Gönderen kimliği paylaşılmaz.');expect(fixture.nativeElement.textContent).toContain('Güvenli yanıt');expect(fixture.nativeElement.querySelector('a[href^="/profil/"]')).toBeNull();
  });

  it('renders a real community and its pinned content deep link',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===getCommunityBySlug?{id:'community',slug:'urun',name:'Ürün',description:'Birlikte üret',visibility:'Public',rules:['Saygılı ol'],pinnedContentIds:['post'],activeMemberCount:8,viewerMembershipStatus:'Active',viewerRole:'Member',updatedAtUtc:'2026-08-14T00:00:00Z'}:null);
    const fixture=await render(MobileCommunityDetailPage,routeParam('slug','urun'),invoke);
    expect(fixture.nativeElement.textContent).toContain('8 aktif üye');expect(fixture.nativeElement.textContent).toContain('Saygılı ol');expect(fixture.nativeElement.querySelector('a[href="/icerik/post"]')).toBeTruthy();
  });
});
