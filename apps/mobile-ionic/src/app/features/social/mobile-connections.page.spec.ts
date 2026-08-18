import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,provideRouter } from '@angular/router';
import { acceptFollow,Api,getProfileByHandle,getSocialGraphSummary,listIncomingFollowRequests,listSocialGraphProfiles,SocialGraphProfileView } from '@platform/api';
import { BehaviorSubject } from 'rxjs';
import { describe,expect,it,vi } from 'vitest';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileConnectionsPage } from './mobile-connections.page';

const PERSON:SocialGraphProfileView={ownerId:'requester',handle:'ayse',displayName:'Ayşe',profileMediaId:null,isVerified:false};

async function render(invoke:ReturnType<typeof vi.fn>,query:Record<string,string>={},subject=signal<string|null>('owner')){
  const params=new BehaviorSubject(convertToParamMap(query));
  await TestBed.configureTestingModule({imports:[MobileConnectionsPage],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{queryParamMap:params.asObservable()}},{provide:MobileSession,useValue:{subject}},{provide:Api,useValue:{invoke}}]}).compileComponents();
  const fixture=TestBed.createComponent(MobileConnectionsPage);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return{fixture,page:fixture.componentInstance,params};
}

describe('MobileConnectionsPage social graph',()=>{
  it('opens the owner request queue from a notification deep link and accepts a request',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===getSocialGraphSummary?{ownerId:'owner',followerCount:2,followingCount:3,pendingRequestCount:1,canManageRequests:true}:operation===listIncomingFollowRequests?{items:[PERSON],nextCursor:null}:operation===acceptFollow?{}:{items:[],nextCursor:null});
    const {page}=await render(invoke,{view:'requests'});expect(page.graphKind()).toBe('Requests');expect(page.people()).toEqual([PERSON]);
    await page.decide(PERSON,true);expect(page.people()).toEqual([]);expect(page.summary()?.pendingRequestCount).toBe(0);expect(page.summary()?.followerCount).toBe(3);expect(invoke).toHaveBeenCalledWith(acceptFollow,{requesterId:PERSON.ownerId});
  });

  it('loads a linked public profile follower list through the privacy-safe graph contract',async()=>{
    const invoke=vi.fn(async(operation:unknown,params?:{handle?:string})=>operation===getProfileByHandle?{id:'profile',ownerId:'other',handle:params?.handle,displayName:'Diğer'}:operation===getSocialGraphSummary?{ownerId:'other',followerCount:1,followingCount:0,pendingRequestCount:0,canManageRequests:false}:operation===listSocialGraphProfiles?{items:[PERSON],nextCursor:null}:{items:[],nextCursor:null});
    const {page}=await render(invoke,{profil:'diger',view:'followers'});expect(page.people()).toEqual([PERSON]);expect(invoke).toHaveBeenCalledWith(listSocialGraphProfiles,{ownerId:'other',kind:'Followers',limit:20,cursor:undefined});
  });

  it('clears the previous owner graph before loading a changed session',async()=>{
    let releaseSummary!:(value:unknown)=>void;const delayedSummary=new Promise(resolve=>releaseSummary=resolve);const subject=signal<string|null>('owner-a');
    const invoke=vi.fn(async(operation:unknown,params?:{ownerId?:string})=>operation===getSocialGraphSummary?(params?.ownerId==='owner-a'?{ownerId:'owner-a',followerCount:1,followingCount:0,pendingRequestCount:0,canManageRequests:true}:delayedSummary):operation===listSocialGraphProfiles?{items:[{...PERSON,ownerId:`person-${params?.ownerId}`}],nextCursor:null}:{items:[],nextCursor:null});
    const {fixture,page}=await render(invoke,{},subject);expect(page.summary()?.ownerId).toBe('owner-a');expect(page.people()).toHaveLength(1);

    subject.set('owner-b');fixture.detectChanges();

    expect(page.summary()).toBeNull();expect(page.people()).toEqual([]);
    releaseSummary({ownerId:'owner-b',followerCount:0,followingCount:0,pendingRequestCount:0,canManageRequests:true});await delayedSummary;await fixture.whenStable();fixture.detectChanges();
    expect(page.summary()?.ownerId).toBe('owner-b');
  });
});
