import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, getMyProfile, type ProfileView, updateMyProfile } from '@platform/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileMediaResolver } from '../../core/media/mobile-media-resolver.service';
import { MobileProfilePage } from './mobile-profile.page';

const profile=(ownerId:string,handle:string,profileMediaId:string|null):ProfileView=>({
  biography:`${handle} biography`,completenessPercentage:100,coverMediaId:null,displayName:handle,handle,id:`profile-${ownerId}`,isPrivate:false,isVerified:false,language:'Turkish',location:null,organization:null,ownerId,profileMediaId,reduceMotion:false,theme:'System',version:1,websiteUrl:null,
});

describe('MobileProfilePage session ownership',()=>{
  afterEach(()=>{localStorage.clear();TestBed.resetTestingModule();});

  it('clears account A cached text and media before account B resolves',async()=>{
    const subject=signal<string|null>('account-a');const sessionRevision=signal(0);const authenticated=signal(true);
    localStorage.setItem('escp:mobile:public-profile:v2:account-a',JSON.stringify(profile('account-a','account_a','avatar-a')));
    let resolveA!:(value:ProfileView)=>void;let resolveB!:(value:ProfileView)=>void;
    const pendingA=new Promise<ProfileView>(resolve=>resolveA=resolve);const pendingB=new Promise<ProfileView>(resolve=>resolveB=resolve);
    const invoke=vi.fn(()=>subject()==='account-a'?pendingA:pendingB);const release=vi.fn();
    await TestBed.configureTestingModule({imports:[MobileProfilePage],providers:[{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject}},{provide:MobileMediaResolver,useValue:{resolve:vi.fn().mockResolvedValue({mediaId:'avatar-a',url:'blob:account-a',contentType:'image/png',release}),sessionRevision,authenticated}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileProfilePage);fixture.detectChanges();await Promise.resolve();fixture.detectChanges();
    expect(fixture.componentInstance.profile()?.handle).toBe('account_a');expect(fixture.nativeElement.querySelector('zm-mobile-authorized-media-gallery')).toBeTruthy();

    subject.set('account-b');sessionRevision.update(value=>value+1);fixture.detectChanges();await Promise.resolve();fixture.detectChanges();
    expect(fixture.componentInstance.profile()).toBeNull();expect(fixture.nativeElement.querySelector('zm-mobile-authorized-media-gallery')).toBeNull();

    resolveA(profile('account-a','late_a','avatar-a'));resolveB(profile('account-b','account_b',null));await fixture.whenStable();fixture.detectChanges();
    expect(fixture.componentInstance.profile()?.handle).toBe('account_b');expect(fixture.componentInstance.profile()?.handle).not.toBe('late_a');fixture.destroy();expect(release).toHaveBeenCalled();
  });

  it('unlocks saving for account B while account A save completion is stale',async()=>{
    const subject=signal<string|null>('account-a');let finishSave!:(value:ProfileView)=>void;const pendingSave=new Promise<ProfileView>(resolve=>finishSave=resolve);
    const invoke=vi.fn((operation:unknown)=>operation===updateMyProfile?pendingSave:operation===getMyProfile?Promise.resolve(profile(subject()! as string,subject()==='account-a'?'account_a':'account_b',null)):Promise.reject(new Error('unexpected')));
    await TestBed.configureTestingModule({imports:[MobileProfilePage],providers:[{provide:Api,useValue:{invoke}},{provide:MobileSession,useValue:{subject}},{provide:MobileMediaResolver,useValue:{resolve:vi.fn(),sessionRevision:signal(0),authenticated:signal(true)}}]}).compileComponents();
    const fixture=TestBed.createComponent(MobileProfilePage);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const save=fixture.componentInstance.save();expect(fixture.componentInstance.saving()).toBe(true);
    subject.set('account-b');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();expect(fixture.componentInstance.saving()).toBe(false);expect(fixture.componentInstance.profile()?.handle).toBe('account_b');
    finishSave(profile('account-a','late_a',null));await save;expect(fixture.componentInstance.profile()?.handle).toBe('account_b');fixture.destroy();
  });
});
