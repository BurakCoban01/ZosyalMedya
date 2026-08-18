import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import {
  Api, changeCommunity, CommunityMemberView, createComment, deleteComment, follow, getCommunityBySlug, getContent, getFeed, getMyProfile, getPoll,
  getProfileByHandle, getProfileQuestions, getQuestion, getReactionSummary, getRelationship, getSocialGraphSummary, listComments,
  listCommunityMembers, listSocialGraphProfiles, setCommunityPin, setCommunityRules, updateComment
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { CommunityDetailPage } from './community-detail.page';
import { ContentDetailPage } from './content-detail.page';
import { ProfileDetailPage } from './profile-detail.page';
import { QuestionDetailPage } from './question-detail.page';

function routeParam(name: string, value: string) {
  const paramMap = { get: (key: string) => key === name ? value : null };
  const queryParamMap = { get: (_key: string) => null };
  return { snapshot: { paramMap, queryParamMap }, paramMap: of(paramMap), queryParamMap: of(queryParamMap) };
}

async function render<T>(component: Type<T>, invoke: ReturnType<typeof vi.fn>, route: object) {
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRouter([]), { provide: Api, useValue: { invoke } }, { provide: ActivatedRoute, useValue: route }, {provide:MediaResolver,useValue:{resolve:vi.fn().mockRejectedValue(new Error('unavailable')),sessionRevision:signal(0)}}, {provide:TokenVault,useValue:{accessToken:()=>null}}]
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('viewer-safe detail routes', () => {
  it('renders a real public profile without exposing an edit form', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getProfileByHandle ? ({
      id:'profile',ownerId:'owner',handle:'ayse_dev',displayName:'Ayşe Yılmaz',biography:'Ürün tasarımcısı',
      location:'İstanbul',organization:'Zosyal Studio',websiteUrl:null,profileMediaId:null,coverMediaId:null,
      isPrivate:false,isVerified:true,theme:'System',language:'Turkish',reduceMotion:false,completenessPercentage:80,version:1
    }) : operation === getProfileQuestions ? [{id:'anonymous-answer',targetId:'owner',senderId:null,body:'Anonim profil sorusu',isAnonymous:true,audience:'Public',status:'Answered',answer:'Görünür yanıt',publishAtUtc:null,answeredAtUtc:'2026-08-13T09:00:00Z',createdAtUtc:'2026-08-13T08:00:00Z',version:2}]
      : operation === getFeed ? {items:[],nextCursor:null,strategy:'chronological-profile'}
      : operation === getSocialGraphSummary ? {ownerId:'owner',followerCount:2,followingCount:3,pendingRequestCount:0,canManageRequests:false}
      : operation === listSocialGraphProfiles ? {items:[],nextCursor:null} : null);
    const fixture = await render(ProfileDetailPage, invoke, routeParam('handle', 'ayse_dev'));
    expect(fixture.nativeElement.textContent).toContain('Ayşe Yılmaz');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(invoke).toHaveBeenCalledWith(getProfileByHandle, { handle: 'ayse_dev' });
    expect(invoke).toHaveBeenCalledWith(getFeed, { kind:'Profile',profileId:'owner',limit:10,cursor:undefined });
    expect(invoke).toHaveBeenCalledWith(getProfileQuestions,{targetId:'owner',limit:6});
    expect(fixture.nativeElement.textContent).toContain('Anonim profil sorusu');
    expect(fixture.nativeElement.querySelector('.profile-questions li small a')).toBeNull();
  });

  it('shows truthful relationship actions and follows the visible profile', async () => {
    const profile = {
      id:'profile',ownerId:'target-owner',handle:'ayse_dev',displayName:'Ayşe Yılmaz',biography:'Ürün tasarımcısı',
      location:'İstanbul',organization:'Zosyal Studio',websiteUrl:null,profileMediaId:null,coverMediaId:null,
      isPrivate:false,isVerified:true,theme:'System',language:'Turkish',reduceMotion:false,completenessPercentage:80,version:1
    };
    const none = { actorId:'viewer',targetId:profile.ownerId,followState:'None',isBlocked:false,isBlockedByTarget:false,isMuted:false,isCloseFriend:false,version:0 };
    const following = { ...none, followState:'Following', version:1 };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getProfileByHandle) return profile;
      if (operation === getMyProfile) return { ...profile, ownerId:'viewer', handle:'viewer' };
      if (operation === getRelationship) return none;
      if (operation === getFeed) return {items:[],nextCursor:null,strategy:'chronological-profile'};
      if (operation === getSocialGraphSummary) return {ownerId:profile.ownerId,followerCount:2,followingCount:3,pendingRequestCount:0,canManageRequests:false};
      if (operation === listSocialGraphProfiles) return {items:[],nextCursor:null};
      if (operation === follow) return following;
      return null;
    });
    const fixture = await render(ProfileDetailPage, invoke, routeParam('handle', 'ayse_dev'));
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Takip et');
    expect(fixture.nativeElement.querySelector('a[href="/sorular?profil=ayse_dev"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/mesajlar?profil=ayse_dev"]')).toBeTruthy();

    await page.toggleFollow();

    expect(invoke).toHaveBeenCalledWith(follow, { targetId: profile.ownerId });
    expect(page.relationship()?.followState).toBe('Following');
  });

  it('loads content and its real interaction context through separate operations', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getContent) return {id:'content',authorId:'author',text:'Gerçek gönderi',visibility:'Public',status:'Published',shareKind:'Original',mediaIds:[],mentions:[],hashtags:['tasarım'],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-13T08:00:00Z',version:1,viewCount:12};
      if (operation === getReactionSummary) return {contentId:'content',counts:{Like:2},viewerReaction:null};
      if (operation === listComments) return {items:[{id:'comment',contentId:'content',authorId:'author-2',parentId:null,depth:0,text:'Katılıyorum',mentions:[],status:'Visible',createdAtUtc:'2026-08-13T09:00:00Z',version:1,author:{ownerId:'author-2',handle:'ayse_dev',displayName:'Ayşe',profileMediaId:null,isVerified:false},canManage:false}],nextCursor:null};
      if (operation === getPoll) throw { status: 404 };
      return null;
    });
    const fixture = await render(ContentDetailPage, invoke, routeParam('id', 'content'));
    expect(fixture.nativeElement.textContent).toContain('Gerçek gönderi');
    expect(fixture.nativeElement.textContent).toContain('Beğeni · 2');
    expect(fixture.nativeElement.textContent).toContain('Katılıyorum');
    expect(fixture.nativeElement.querySelector('.comment-list a')?.getAttribute('href')).toBe('/profil/ayse_dev');
    expect(fixture.nativeElement.querySelector('zm-post-card')).toBeNull();
  });

  it('replies, edits and deletes an owner comment through the real operations', async () => {
    const comment={id:'comment',contentId:'content',authorId:'owner',parentId:null,depth:0,text:'İlk yorum',mentions:[],status:'Visible',createdAtUtc:'2026-08-13T09:00:00Z',version:1,author:{ownerId:'owner',handle:'owner',displayName:'Owner',profileMediaId:null,isVerified:false},canManage:true};
    const reply={...comment,id:'reply',parentId:'comment',depth:1,text:'Yanıt'};
    const updated={...comment,text:'Güncel yorum',version:2};
    const deleted={...updated,text:'',status:'Deleted',authorId:null,author:null,canManage:false,version:3};
    const invoke=vi.fn(async(operation:unknown)=>{
      if(operation===getContent)return {id:'content',authorId:'owner',text:'Gönderi',visibility:'Public',status:'Published',shareKind:'Original',originalPostId:null,mediaIds:[],mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-13T08:00:00Z',version:1,viewCount:1};
      if(operation===listComments)return {items:[comment],nextCursor:null};
      if(operation===getReactionSummary)return {contentId:'content',counts:{},viewerReaction:null};
      if(operation===getPoll)throw {status:404};
      if(operation===createComment)return reply;
      if(operation===updateComment)return updated;
      if(operation===deleteComment)return deleted;
      return null;
    });
    const fixture=await render(ContentDetailPage,invoke,routeParam('id','content'));
    const page=fixture.componentInstance;
    page.replyTarget.set(comment);
    const form={reset:vi.fn()} as unknown as HTMLFormElement;
    await page.submitComment({preventDefault:vi.fn(),target:form} as unknown as Event,'Yanıt');
    await page.saveComment({preventDefault:vi.fn()} as unknown as Event,comment,'Güncel yorum');
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await page.removeComment(updated);

    expect(invoke).toHaveBeenCalledWith(createComment,{contentId:'content',body:{text:'Yanıt',parentId:'comment'}});
    expect(invoke).toHaveBeenCalledWith(updateComment,{contentId:'content',commentId:'comment',body:{text:'Güncel yorum'}});
    expect(invoke).toHaveBeenCalledWith(deleteComment,{contentId:'content',commentId:'comment'});
    expect(page.comments().find(item=>item.id==='comment')?.status).toBe('Deleted');
    expect(page.comments()).toContainEqual(reply);
  });

  it('renders authorized media for both a quote and its visible source', async () => {
    const quote={id:'quote',authorId:'author',text:'Kaynağa bak',visibility:'Public',status:'Published',shareKind:'Quote',originalPostId:'source',mediaIds:['quote-media'],mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-13T08:00:00Z',version:1,viewCount:2};
    const source={...quote,id:'source',text:'',shareKind:'Original',originalPostId:null,mediaIds:['source-media']};
    const invoke=vi.fn(async(operation:unknown,params?:{contentId?:string})=>operation===getContent?(params?.contentId==='source'?source:quote):operation===getPoll?Promise.reject({status:404}):operation===listComments?{items:[],nextCursor:null}:operation===getReactionSummary?{contentId:'quote',counts:{},viewerReaction:null}:null);
    const fixture=await render(ContentDetailPage,invoke,routeParam('id','quote'));
    const galleries=fixture.nativeElement.querySelectorAll('zm-authorized-media-gallery');
    expect(galleries).toHaveLength(2);expect(galleries[0].getAttribute('label')).toBe('Gönderi medyası');expect(galleries[1].getAttribute('label')).toBe('Kaynak gönderinin medyası');
    expect(fixture.nativeElement.textContent).toContain('Metinsiz medya paylaşımı');
  });

  it('keeps anonymous question identity hidden and renders the answer', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getQuestion ? ({
      id:'question',targetId:'target',senderId:null,body:'Nasıl başladın?',isAnonymous:true,audience:'Public',status:'Answered',answer:'Küçük adımlarla.',publishAtUtc:null,answeredAtUtc:'2026-08-13T09:00:00Z',createdAtUtc:'2026-08-13T08:00:00Z',version:2
    }) : null);
    const fixture = await render(QuestionDetailPage, invoke, routeParam('id', 'question'));
    expect(fixture.nativeElement.textContent).toContain('Anonim bir soru');
    expect(fixture.nativeElement.textContent).toContain('kimlik bilgisi bu yanıtta paylaşılmaz');
    expect(fixture.nativeElement.textContent).toContain('Küçük adımlarla.');
    expect(fixture.nativeElement.querySelector('.sender a')).toBeNull();
  });

  it('links a non-anonymous question to its real sender profile', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getQuestion ? ({
      id:'open-question',targetId:'target',senderId:'sender',sender:{ownerId:'sender',handle:'acik_gonderen',displayName:'Açık Gönderen',profileMediaId:null,isVerified:false},body:'Açık soru',isAnonymous:false,audience:'Followers',status:'Answered',answer:'Açık yanıt',publishAtUtc:null,answeredAtUtc:'2026-08-13T09:00:00Z',createdAtUtc:'2026-08-13T08:00:00Z',version:2
    }) : null);
    const fixture = await render(QuestionDetailPage, invoke, routeParam('id', 'open-question'));
    expect(fixture.nativeElement.querySelector('.sender a')?.getAttribute('href')).toBe('/profil/acik_gonderen');
    expect(fixture.nativeElement.textContent).toContain('Açık Gönderen · @acik_gonderen');
  });

  it('renders community summary without a member identity list', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getCommunityBySlug ? ({
      id:'community',slug:'urun-tasarimi',name:'Ürün Tasarımı',description:'Birlikte öğrenme alanı',visibility:'Public',rules:['Saygılı ol'],pinnedContentIds:[],activeMemberCount:12,viewerMembershipStatus:null,viewerRole:null,updatedAtUtc:'2026-08-13T08:00:00Z'
    }) : null);
    const fixture = await render(CommunityDetailPage, invoke, routeParam('slug', 'urun-tasarimi'));
    expect(fixture.nativeElement.textContent).toContain('12 aktif üye');
    expect(fixture.nativeElement.textContent).toContain('Saygılı ol');
    expect(invoke).toHaveBeenCalledWith(getCommunityBySlug, { slug: 'urun-tasarimi' });
  });

  it('requests real public community membership and reloads the safe detail', async () => {
    const available = {id:'community',slug:'veri-yapay-zeka',name:'Veri ve Yapay Zekâ',description:'Birlikte öğrenme alanı',visibility:'Public',rules:[],pinnedContentIds:[],activeMemberCount:3,viewerMembershipStatus:null,viewerRole:null,updatedAtUtc:'2026-08-13T08:00:00Z'};
    const joined = {...available,activeMemberCount:4,viewerMembershipStatus:'Active',viewerRole:'Member'};
    let detailCalls = 0;
    const invoke = vi.fn(async (operation: unknown) => operation === getCommunityBySlug ? (++detailCalls === 1 ? available : joined) : operation === changeCommunity ? joined : null);
    const fixture = await render(CommunityDetailPage, invoke, routeParam('slug', available.slug));

    await fixture.componentInstance.requestMembership();
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(changeCommunity, { id: available.id, body: { change:'RequestMembership', targetId:null, reason:null } });
    expect(fixture.componentInstance.community()?.viewerRole).toBe('Member');
    expect(fixture.nativeElement.textContent).toContain('Topluluğa katıldın.');
  });

  it('confirms and leaves an active community membership', async () => {
    const joined = {id:'community',slug:'veri',name:'Veri',description:'Birlikte',visibility:'Public',rules:[],pinnedContentIds:[],activeMemberCount:4,viewerMembershipStatus:'Active',viewerRole:'Member',updatedAtUtc:'2026-08-13T08:00:00Z'};
    const left = {...joined,activeMemberCount:3,viewerMembershipStatus:'Removed',viewerRole:null};
    let detailCalls = 0;
    const invoke = vi.fn(async (operation:unknown) => operation===getCommunityBySlug?(++detailCalls===1?joined:left):operation===changeCommunity?left:null);
    vi.spyOn(window,'confirm').mockReturnValue(true);
    const fixture = await render(CommunityDetailPage,invoke,routeParam('slug',joined.slug));

    await fixture.componentInstance.leave(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(changeCommunity,{id:joined.id,body:{change:'Leave',targetId:null,reason:null}});
    expect(fixture.componentInstance.community()?.viewerRole).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Topluluktan ayrıldın.');
  });

  it('lets a removed public member join again', async () => {
    const removed = {id:'community',slug:'veri',name:'Veri',description:'Birlikte',visibility:'Public',rules:[],pinnedContentIds:[],activeMemberCount:3,viewerMembershipStatus:'Removed',viewerRole:null,updatedAtUtc:'2026-08-13T08:00:00Z'};
    const joined = {...removed,activeMemberCount:4,viewerMembershipStatus:'Active',viewerRole:'Member'};
    let detailCalls = 0;
    const invoke = vi.fn(async (operation:unknown) => operation===getCommunityBySlug?(++detailCalls===1?removed:joined):operation===changeCommunity?joined:null);
    const fixture = await render(CommunityDetailPage,invoke,routeParam('slug',removed.slug));

    expect(fixture.nativeElement.textContent).toContain('Topluluğa katıl');
    await fixture.componentInstance.requestMembership(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(changeCommunity,{id:removed.id,body:{change:'RequestMembership',targetId:null,reason:null}});
    expect(fixture.componentInstance.community()?.viewerRole).toBe('Member');
  });

  it('lets a community owner manage real rules, pins and pending memberships', async () => {
    const owner = {id:'community',slug:'urun-ekibi',name:'Ürün Ekibi',description:'Birlikte üretim',visibility:'Public',rules:['Saygılı ol'],pinnedContentIds:['content'],activeMemberCount:4,viewerMembershipStatus:'Active',viewerRole:'Owner',updatedAtUtc:'2026-08-13T08:00:00Z'};
    const pending:CommunityMemberView[] = [{userId:'candidate',handle:'aday',displayName:'Aday Üye',profileMediaId:null,isVerified:false,role:'Member',status:'Pending',updatedAtUtc:'2026-08-14T08:00:00Z'}];
    const invoke = vi.fn(async (operation:unknown) => operation===getCommunityBySlug?owner:operation===listCommunityMembers?pending:owner);
    const fixture = await render(CommunityDetailPage, invoke, routeParam('slug', owner.slug));

    await fixture.componentInstance.saveRules('Saygılı ol\nKaynak göster');
    await fixture.componentInstance.unpin('content');
    await fixture.componentInstance.approve(pending[0]!);

    expect(invoke).toHaveBeenCalledWith(setCommunityRules,{id:owner.id,body:{rules:['Saygılı ol','Kaynak göster']}});
    expect(invoke).toHaveBeenCalledWith(setCommunityPin,{id:owner.id,contentId:'content',pinned:false});
    expect(invoke).toHaveBeenCalledWith(changeCommunity,{id:owner.id,body:{change:'Approve',targetId:'candidate',reason:null}});
    expect(invoke).toHaveBeenCalledWith(listCommunityMembers,{id:owner.id,status:'Pending',limit:50});
  });

  it('does not restore an approved candidate from a stale pending-member refresh', async () => {
    const owner = {id:'community',slug:'urun-ekibi',name:'Ürün Ekibi',description:'Birlikte üretim',visibility:'Private',rules:[],pinnedContentIds:[],activeMemberCount:4,viewerMembershipStatus:'Active',viewerRole:'Owner',updatedAtUtc:'2026-08-13T08:00:00Z'};
    const candidate:CommunityMemberView={userId:'candidate',handle:'aday',displayName:'Aday Üye',profileMediaId:null,isVerified:false,role:'Member',status:'Pending',updatedAtUtc:'2026-08-14T08:00:00Z'};
    let resolveStale!:(items:CommunityMemberView[])=>void;const stale=new Promise<CommunityMemberView[]>(resolve=>resolveStale=resolve);let memberCalls=0;
    const invoke=vi.fn(async(operation:unknown)=>operation===getCommunityBySlug?owner:operation===listCommunityMembers?(++memberCalls===2?stale:[]):owner);
    const fixture=await render(CommunityDetailPage,invoke,routeParam('slug',owner.slug));

    const refresh=fixture.componentInstance.loadMembers(owner.id);fixture.componentInstance.pendingMembers.set([candidate]);await fixture.componentInstance.approve(candidate);resolveStale([candidate]);await refresh;

    expect(fixture.componentInstance.pendingMembers()).toEqual([]);
  });

  it('clears moderator identities on a community parameter navigation and ignores delayed members', async () => {
    const moderator={id:'first',slug:'ilk',name:'İlk',description:'Yönetilen',visibility:'Private',rules:[],pinnedContentIds:[],activeMemberCount:2,viewerMembershipStatus:'Active',viewerRole:'Moderator',updatedAtUtc:'2026-08-14T08:00:00Z'};
    const publicCommunity={...moderator,id:'second',slug:'ikinci',name:'İkinci',description:'Üye olunmayan',viewerMembershipStatus:null,viewerRole:null};
    const params=new BehaviorSubject<{get:(key:string)=>string|null}>({get:(key:string)=>key==='slug'?'ilk':null});let resolveMembers!:(items:CommunityMemberView[])=>void;const delayed=new Promise<CommunityMemberView[]>(resolve=>resolveMembers=resolve);
    const invoke=vi.fn(async(operation:unknown,request:{slug?:string})=>operation===getCommunityBySlug?(request.slug==='ilk'?moderator:publicCommunity):operation===listCommunityMembers?delayed:null);
    const route={snapshot:{paramMap:params.value},paramMap:params.asObservable()};
    await TestBed.configureTestingModule({imports:[CommunityDetailPage],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:ActivatedRoute,useValue:route}]}).compileComponents();
    const fixture=TestBed.createComponent(CommunityDetailPage);fixture.detectChanges();await Promise.resolve();

    params.next({get:(key:string)=>key==='slug'?'ikinci':null});fixture.detectChanges();await fixture.whenStable();resolveMembers([{userId:'private',handle:'ozel',displayName:'Özel Aday',profileMediaId:null,isVerified:false,role:'Member',status:'Pending',updatedAtUtc:'2026-08-14T09:00:00Z'}]);await Promise.resolve();fixture.detectChanges();

    expect(fixture.componentInstance.community()?.id).toBe('second');
    expect(fixture.componentInstance.pendingMembers()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Özel Aday');
  });

  it('replaces an unsaved rules draft when navigating between administered communities', async () => {
    const first={id:'first',slug:'ilk',name:'İlk',description:'A',visibility:'Public',rules:['İlk kural'],pinnedContentIds:[],activeMemberCount:1,viewerMembershipStatus:'Active',viewerRole:'Owner',updatedAtUtc:'2026-08-14T08:00:00Z'};
    const second={...first,id:'second',slug:'ikinci',name:'İkinci',rules:['İkinci kural']};const params=new BehaviorSubject<{get:(key:string)=>string|null}>({get:(key:string)=>key==='slug'?'ilk':null});
    const invoke=vi.fn(async(operation:unknown,request:{slug?:string})=>operation===getCommunityBySlug?(request.slug==='ilk'?first:second):operation===listCommunityMembers?[]:second);
    const route={snapshot:{paramMap:params.value},paramMap:params.asObservable()};await TestBed.configureTestingModule({imports:[CommunityDetailPage],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:ActivatedRoute,useValue:route}]}).compileComponents();
    const fixture=TestBed.createComponent(CommunityDetailPage);fixture.detectChanges();await fixture.whenStable();fixture.componentInstance.rulesDraft.set('İlk topluluk taslağı');

    params.next({get:(key:string)=>key==='slug'?'ikinci':null});await fixture.whenStable();await fixture.componentInstance.saveRules();

    expect(invoke).toHaveBeenCalledWith(setCommunityRules,{id:'second',body:{rules:['İkinci kural']}});
  });
});
