import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Api, changeCommunity, getCommunityBySlug } from '@platform/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileCommunityDetailPage } from './mobile-community-detail.page';

describe('mobile community membership', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('confirms and leaves through the real change contract', async () => {
    const joined = { id:'community',slug:'urun',name:'Ürün',description:'Birlikte',visibility:'Public',rules:[],pinnedContentIds:[],activeMemberCount:8,viewerMembershipStatus:'Active',viewerRole:'Member',updatedAtUtc:'2026-08-14T00:00:00Z' };
    const left = { ...joined, activeMemberCount:7, viewerMembershipStatus:'Removed', viewerRole:null };
    let calls = 0;
    const invoke = vi.fn(async (operation:unknown) => operation === getCommunityBySlug ? (++calls === 1 ? joined : left) : operation === changeCommunity ? left : null);
    const paramMap = { get: (key:string) => key === 'slug' ? 'urun' : null };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await TestBed.configureTestingModule({ imports:[MobileCommunityDetailPage], providers:[provideRouter([]), { provide:ActivatedRoute,useValue:{snapshot:{paramMap},paramMap:of(paramMap)} }, { provide:Api,useValue:{invoke} }] }).compileComponents();
    const fixture = TestBed.createComponent(MobileCommunityDetailPage);
    fixture.detectChanges(); await fixture.whenStable();

    await fixture.componentInstance.leave(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(changeCommunity, { id:joined.id,body:{change:'Leave',targetId:null,reason:null} });
    expect(fixture.componentInstance.community()?.viewerRole).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Topluluktan ayrıldın.');
  });

  it('offers the real join action again after a public membership was removed', async () => {
    const removed = { id:'community',slug:'urun',name:'Ürün',description:'Birlikte',visibility:'Public',rules:[],pinnedContentIds:[],activeMemberCount:7,viewerMembershipStatus:'Removed',viewerRole:null,updatedAtUtc:'2026-08-14T00:00:00Z' };
    const joined = { ...removed, activeMemberCount:8, viewerMembershipStatus:'Active', viewerRole:'Member' };
    let hasJoined = false;
    const invoke = vi.fn(async (operation:unknown) => {
      if (operation === changeCommunity) { hasJoined = true; return joined; }
      return operation === getCommunityBySlug ? (hasJoined ? joined : removed) : null;
    });
    const paramMap = { get: (key:string) => key === 'slug' ? 'urun' : null };
    await TestBed.configureTestingModule({ imports:[MobileCommunityDetailPage], providers:[provideRouter([]), { provide:ActivatedRoute,useValue:{snapshot:{paramMap},paramMap:of(paramMap)} }, { provide:Api,useValue:{invoke} }] }).compileComponents();
    const fixture = TestBed.createComponent(MobileCommunityDetailPage);
    fixture.detectChanges(); await fixture.componentInstance.load(); fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Topluluğa katıl');
    await fixture.componentInstance.join(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(changeCommunity, { id:removed.id,body:{change:'RequestMembership',targetId:null,reason:null} });
    expect(fixture.componentInstance.community()?.viewerRole).toBe('Member');
  });
});
