import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap } from '@angular/router';
import { Api, changeMessage, ConversationView, createConversation, getProfileByHandle, listConversations, listMessages, MessageView, SearchHit, sendMessage } from '@platform/api';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileMessagingRealtimeService } from '../../core/realtime/mobile-messaging-realtime.service';
import { MobileMessagingPage } from './mobile-messaging.page';

const PROFILE: SearchHit = {
  deepLink: '/profil/ayse_dev',
  id: 'profile-id',
  matchedTags: [],
  ownerId: '11111111-1111-1111-1111-111111111111',
  score: 1,
  snippet: '@ayse_dev',
  title: 'Ayşe Yılmaz',
  type: 'Profile'
};

const CONVERSATION: ConversationView = {
  id: '22222222-2222-2222-2222-222222222222',
  kind: 'Direct',
  members: [{
    userId: PROFILE.ownerId,
    role: 'Member',
    joinedAtUtc: '2026-07-30T00:00:00Z',
    isMuted: false,
    isArchived: false,
    isPinned: false,
    displayName: PROFILE.title,
    handle: 'ayse_dev'
  }],
  title: '',
  unreadCount: 0,
  updatedAtUtc: '2026-07-30T00:00:00Z',
  version: 1
};

async function mount(invoke: ReturnType<typeof vi.fn>,query:Record<string,string>={},params=new BehaviorSubject(convertToParamMap(query))) {
  await TestBed.configureTestingModule({
    imports: [MobileMessagingPage],
    providers: [
      { provide: Api, useValue: { invoke } },
      { provide: MobileSession, useValue: { subject: () => 'actor', accessToken: () => 'owner-token' } },
      { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } },
      {
        provide: MobileMessagingRealtimeService,
        useValue: {
          connect: vi.fn(async () => undefined),
          join: vi.fn(async () => undefined),
          onMessage: vi.fn(() => () => undefined)
        }
      }
    ]
  }).compileComponents();
  return TestBed.createComponent(MobileMessagingPage).componentInstance;
}

describe('MobileMessagingPage', () => {
  it('starts a direct conversation with the selected real profile owner', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === createConversation) return CONVERSATION;
      if (operation === listConversations) return { items: [CONVERSATION], nextCursor: null };
      if (operation === listMessages) return { items: [], nextCursor: null };
      return {};
    });
    const page = await mount(invoke);
    page.chooseRecipient(PROFILE);

    await page.startConversation();

    expect(invoke).toHaveBeenCalledWith(createConversation, {
      body: { memberIds: [PROFILE.ownerId], title: null }
    });
    expect(page.selected()).toEqual(CONVERSATION);
  });

  it('uses a neutral title instead of exposing member or conversation identifiers', async () => {
    const page = await mount(vi.fn());
    const unidentified = { ...CONVERSATION, members: CONVERSATION.members.map(member => ({ ...member, displayName: null, handle: null })) };

    expect(page.participantLabel(CONVERSATION)).toBe(PROFILE.title);
    expect(page.participantLabel({ ...CONVERSATION, title: 'dm-ayse' })).toBe(PROFILE.title);
    expect(page.participantLabel(unidentified)).toBe('Doğrudan konuşma');
    expect(page.participantLabel({ ...CONVERSATION, kind: 'Group' })).toBe('Grup konuşması');
  });

  it('sends reply context and applies owner message changes', async () => {
    const original: MessageView = { id:'m1', conversationId:CONVERSATION.id, senderId:PROFILE.ownerId,
      text:'Kaynak', mediaIds:[], replyToId:null, status:'Sent', deliveryState:'Read', createdAtUtc:new Date().toISOString(), updatedAtUtc:new Date().toISOString(), version:1 };
    const sent: MessageView = { ...original, id:'m2', senderId:'actor', text:'Yanıt', replyToId:original.id, deliveryState:'Sent' };
    const invoke=vi.fn(async(operation:unknown,params?:{body?:{change?:string}})=>operation===sendMessage?sent:
      operation===changeMessage?{...sent,status:'Deleted',text:'',version:2}:{});
    const page=await mount(invoke);page.actorId.set('actor');page.selected.set(CONVERSATION);page.messages.set([original]);page.replyTo(original);page.composer.controls.text.setValue('Yanıt');

    await page.send();
    expect(invoke).toHaveBeenCalledWith(sendMessage,{conversationId:CONVERSATION.id,body:{text:'Yanıt',mediaIds:[],replyToId:original.id}});
    await page.deleteMessage(sent);
    expect(page.messages().find(item=>item.id===sent.id)?.status).toBe('Deleted');
  });

  it('does not restore a failed send into another conversation', async () => {
    let reject!: (reason?: unknown) => void;
    const pending=new Promise<never>((_resolve,rejectPromise)=>{reject=rejectPromise;});
    const page=await mount(vi.fn(async operation=>operation===sendMessage?pending:{}));
    const message:MessageView={id:'m-a',conversationId:CONVERSATION.id,senderId:'actor',text:'A',mediaIds:[],replyToId:null,status:'Sent',deliveryState:'Sent',createdAtUtc:new Date().toISOString(),updatedAtUtc:new Date().toISOString(),version:1};
    const other={...CONVERSATION,id:'other-conversation'};const otherMessage={...message,id:'m-b',conversationId:other.id,text:'B'};
    page.selected.set(CONVERSATION);page.messages.set([message]);page.composer.controls.text.setValue('A taslağı');

    const sending=page.send();page.selected.set(other);page.messages.set([otherMessage]);reject(new Error('offline'));await sending;

    expect(page.messages()).toEqual([otherMessage]);expect(page.composer.controls.text.value).toBe('');
  });

  it('keeps a newer tombstone when a stale edit arrives', async () => {
    const page=await mount(vi.fn());
    const deleted:MessageView={id:'m1',conversationId:CONVERSATION.id,senderId:'actor',text:'',mediaIds:[],replyToId:null,status:'Deleted',deliveryState:'Read',createdAtUtc:new Date().toISOString(),updatedAtUtc:new Date().toISOString(),version:3};
    page.messages.set([deleted]);

    (page as unknown as {replace(value:MessageView):void}).replace({...deleted,status:'Sent',text:'eski',version:2});

    expect(page.messages()[0]).toEqual(deleted);
  });

  it('preselects a profile from a profile deep link',async()=>{
    const profile={id:'profile',ownerId:PROFILE.ownerId,handle:'ayse_dev',displayName:'Ayşe Yılmaz'};
    const invoke=vi.fn(async(operation:unknown)=>operation===getProfileByHandle?profile:operation===listConversations?{items:[],nextCursor:null}:{});
    const page=await mount(invoke,{profil:'ayse_dev'});page.ngOnInit();
    await vi.waitFor(()=>expect(page.newRecipient()?.ownerId).toBe(PROFILE.ownerId));page.ngOnDestroy();
    expect(invoke).toHaveBeenCalledWith(getProfileByHandle,{handle:'ayse_dev'});
  });

  it('opens only a conversation returned by the authorized conversation list',async()=>{
    const invoke=vi.fn(async(operation:unknown)=>operation===listConversations?{items:[CONVERSATION],nextCursor:null}:operation===listMessages?{items:[],nextCursor:null}:{});
    const page=await mount(invoke,{conversation:CONVERSATION.id});page.ngOnInit();
    await vi.waitFor(()=>expect(page.selected()?.id).toBe(CONVERSATION.id));page.ngOnDestroy();
    expect(invoke).toHaveBeenCalledWith(listMessages,{conversationId:CONVERSATION.id,limit:100});
  });

  it('clears an active thread and stale recipient before resolving a new profile route',async()=>{
    let rejectProfile!:(reason?:unknown)=>void;const delayedProfile=new Promise<never>((_resolve,reject)=>rejectProfile=reject);
    const invoke=vi.fn(async(operation:unknown)=>operation===getProfileByHandle?delayedProfile:operation===listConversations?{items:[],nextCursor:null}:{});
    const params=new BehaviorSubject(convertToParamMap({}));const page=await mount(invoke,{},params);page.ngOnInit();
    const existing:MessageView={id:'old',conversationId:CONVERSATION.id,senderId:'actor',text:'Eski konuşma',mediaIds:[],replyToId:null,status:'Sent',deliveryState:'Read',createdAtUtc:new Date().toISOString(),updatedAtUtc:new Date().toISOString(),version:1};
    page.selected.set(CONVERSATION);page.messages.set([existing]);page.newRecipient.set(PROFILE);page.composer.controls.text.setValue('Eski taslak');

    params.next(convertToParamMap({profil:'yeni'}));

    expect(page.selected()).toBeNull();expect(page.messages()).toEqual([]);expect(page.newRecipient()).toBeNull();expect(page.composer.controls.text.value).toBe('');
    rejectProfile(new Error('not found'));await delayedProfile.catch(()=>undefined);await Promise.resolve();
    expect(page.newRecipient()).toBeNull();page.ngOnDestroy();
  });

  it('clears an old thread while an unavailable conversation deep link is checked',async()=>{
    let releaseList!:(value:{items:ConversationView[];nextCursor:null})=>void;const delayedList=new Promise<{items:ConversationView[];nextCursor:null}>(resolve=>releaseList=resolve);let listCalls=0;
    const invoke=vi.fn(async(operation:unknown)=>operation===listConversations?(++listCalls===1?{items:[CONVERSATION],nextCursor:null}:delayedList):{});
    const params=new BehaviorSubject(convertToParamMap({}));const page=await mount(invoke,{},params);page.ngOnInit();await vi.waitFor(()=>expect(page.conversations()).toHaveLength(1));
    const existing:MessageView={id:'old',conversationId:CONVERSATION.id,senderId:'actor',text:'Eski konuşma',mediaIds:[],replyToId:null,status:'Sent',deliveryState:'Read',createdAtUtc:new Date().toISOString(),updatedAtUtc:new Date().toISOString(),version:1};page.selected.set(CONVERSATION);page.messages.set([existing]);

    params.next(convertToParamMap({conversation:'unavailable'}));

    expect(page.selected()).toBeNull();expect(page.messages()).toEqual([]);
    releaseList({items:[],nextCursor:null});await delayedList;await vi.waitFor(()=>expect(page.message()).toContain('kullanılamıyor'));expect(page.selected()).toBeNull();page.ngOnDestroy();
  });
});
