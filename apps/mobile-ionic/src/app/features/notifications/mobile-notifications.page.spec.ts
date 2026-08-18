import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Api,listNotifications,markNotificationRead,NotificationView } from '@platform/api';
import { describe,expect,it,vi } from 'vitest';
import { MobileMessagingRealtimeService } from '../../core/realtime/mobile-messaging-realtime.service';
import { MobileNotificationsPage } from './mobile-notifications.page';

const notification=(overrides:Partial<NotificationView>={}):NotificationView=>({id:'notice',actorId:null,arguments:{},bodyTemplateKey:'body',count:1,createdAtUtc:'2026-08-14T00:00:00Z',deepLink:'/akis',deliveryState:'Delivered',entityId:null,isRead:false,templateVersion:1,titleTemplateKey:'title',type:'System',version:1,...overrides});

async function mount(invoke:ReturnType<typeof vi.fn>,navigateByUrl=vi.fn(async()=>true)){
  await TestBed.configureTestingModule({imports:[MobileNotificationsPage],providers:[{provide:Api,useValue:{invoke}},{provide:Router,useValue:{navigateByUrl}},{provide:MobileMessagingRealtimeService,useValue:{onNotification:vi.fn(()=>()=>undefined),connect:vi.fn(async()=>undefined)}}]}).compileComponents();
  return{page:TestBed.createComponent(MobileNotificationsPage).componentInstance,navigateByUrl};
}

describe('MobileNotificationsPage',()=>{
  it('derives semantic internal targets and rejects protocol-relative or backslash links',async()=>{
    const {page}=await mount(vi.fn());
    expect(page.targetLink(notification({type:'Comment',entityId:'content'}))).toBe('/icerik/content');
    expect(page.targetLink(notification({titleTemplateKey:'notification.question.title',entityId:'question'}))).toBe('/sorular/question');
    expect(page.targetLink(notification({type:'NewFollower',arguments:{followState:'Pending'}}))).toBe('/baglantilar?view=requests');
    expect(page.targetLink(notification({deepLink:'//evil.example'}))).toBeNull();
    expect(page.targetLink(notification({deepLink:'/safe\\evil'}))).toBeNull();
  });

  it('marks an unsafe notification read without navigating outside safe app routes',async()=>{
    const changed=notification({deepLink:'//evil.example',isRead:true});const invoke=vi.fn(async(operation:unknown)=>operation===markNotificationRead?changed:{});const {page,navigateByUrl}=await mount(invoke);page.items.set([notification({deepLink:'//evil.example'})]);
    await page.open(page.items()[0]);expect(navigateByUrl).not.toHaveBeenCalled();expect(page.items()[0].isRead).toBe(true);expect(page.message()).toContain('güvenli');
  });

  it('keeps a newer realtime refresh when an older notification request completes later',async()=>{
    let release!:(value:{items:NotificationView[];nextCursor:null})=>void;const oldPage=new Promise<{items:NotificationView[];nextCursor:null}>(resolve=>release=resolve);let calls=0;const fresh=notification({id:'fresh',isRead:true});const invoke=vi.fn((operation:unknown)=>operation===listNotifications?(++calls===1?oldPage:Promise.resolve({items:[fresh],nextCursor:null})):Promise.resolve({}));const {page}=await mount(invoke);
    const oldLoad=page.load(false);await page.load(false);release({items:[notification({id:'old'})],nextCursor:null});await oldLoad;expect(page.items()).toEqual([fresh]);
  });
});
