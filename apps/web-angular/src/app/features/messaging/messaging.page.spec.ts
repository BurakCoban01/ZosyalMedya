import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import {
  Api,
  changeMessage,
  ConversationView,
  createConversation,
  getProfileByHandle,
  listConversations,
  listMessages,
  MessageView,
  SearchHit,
  sendMessage
} from '@platform/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenVault } from '../../core/auth/token-vault.service';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { SessionMediaCleanup } from '../../core/media/session-media-cleanup.service';
import { MessagingRealtimeService } from '../../core/realtime/messaging-realtime.service';
import { MessagingPage } from './messaging.page';

const TARGET: SearchHit = {
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
  id: 'conversation-id',
  kind: 'Direct',
  members: [
    {
      isArchived: false,
      isMuted: false,
      isPinned: false,
      joinedAtUtc: '2026-07-30T06:00:00Z',
      role: 'Member',
      userId: TARGET.ownerId,
      displayName: TARGET.title,
      handle: 'ayse_dev'
    }
  ],
  title: '',
  unreadCount: 0,
  updatedAtUtc: '2026-07-30T06:00:00Z',
  version: 1
};

const MESSAGE: MessageView = {
  conversationId: CONVERSATION.id,
  createdAtUtc: '2026-07-30T06:05:00Z',
  deliveryState: 'Read',
  id: 'message-id',
  mediaIds: [],
  replyToId: null,
  senderId: TARGET.ownerId,
  status: 'Sent',
  text: 'Gerçek konuşma geçmişi',
  updatedAtUtc: '2026-07-30T06:05:00Z',
  version: 1
};

describe('MessagingPage profile selection', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: MediaResolver, useValue: { resolve: vi.fn() } },{provide:SessionMediaCleanup,useValue:{delete:vi.fn().mockResolvedValue(true)}}] }));
  it('preselects the real profile requested by the profile CTA', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getProfileByHandle
      ? { id: TARGET.id, ownerId: TARGET.ownerId, handle: 'ayse_dev', displayName: TARGET.title }
      : operation === listConversations ? { items: [], nextCursor: null } : {});
    const realtime = { onMessage: vi.fn(() => () => undefined), connect: vi.fn(async () => undefined), join: vi.fn(), typing: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } }, { provide: MessagingRealtimeService, useValue: realtime },
        { provide: TokenVault, useValue: { accessToken: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'profil' ? 'ayse_dev' : null } } } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(MessagingPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(getProfileByHandle, { handle: 'ayse_dev' });
    expect(fixture.componentInstance.conversationTarget()?.ownerId).toBe(TARGET.ownerId);
  });

  it('starts a conversation with the selected profile owner and keeps a friendly label', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === createConversation) return CONVERSATION;
      if (operation === listConversations) return { items: [CONVERSATION], nextCursor: null };
      if (operation === listMessages) return { items: [], nextCursor: null };
      return {};
    });
    const realtime = {
      onMessage: vi.fn(() => () => undefined),
      connect: vi.fn(async () => undefined),
      join: vi.fn(async () => undefined),
      typing: vi.fn(async () => undefined)
    };
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } },
        { provide: MessagingRealtimeService, useValue: realtime },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const page = TestBed.createComponent(MessagingPage).componentInstance;
    page.selectConversationTarget(TARGET);

    await page.startConversation();

    expect(invoke).toHaveBeenCalledWith(createConversation, {
      body: { memberIds: [TARGET.ownerId], title: null }
    });
    expect(page.participantLabel(CONVERSATION)).toBe('Ayşe Yılmaz');
    expect(page.conversationLabel({ ...CONVERSATION, title: 'dm-ayse' })).toBe('Ayşe Yılmaz');
  });

  it('uses a truthful neutral label when member identity is absent from the contract', async () => {
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke: vi.fn() } },
        {
          provide: MessagingRealtimeService,
          useValue: {
            onMessage: vi.fn(() => () => undefined),
            connect: vi.fn(),
            join: vi.fn(),
            typing: vi.fn()
          }
        },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const page = TestBed.createComponent(MessagingPage).componentInstance;

    const unidentified = { ...CONVERSATION, members: CONVERSATION.members.map(member => ({ ...member, displayName: null, handle: null })) };
    expect(page.participantLabel(unidentified)).toBe('Doğrudan konuşma');
    expect(page.participantLabel(unidentified)).not.toContain(TARGET.ownerId.slice(0, 8));
  });

  it('shows a retryable error instead of a false empty thread when history fails', async () => {
    let historyFails = true;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listConversations) return { items: [CONVERSATION], nextCursor: null };
      if (operation === listMessages) {
        if (historyFails) throw new Error('history failed');
        return { items: [MESSAGE], nextCursor: null };
      }
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } },
        {
          provide: MessagingRealtimeService,
          useValue: {
            onMessage: vi.fn(() => () => undefined),
            connect: vi.fn(async () => undefined),
            join: vi.fn(async () => undefined),
            typing: vi.fn(async () => undefined)
          }
        },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(MessagingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.messageLoadError()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Mesajlar yüklenemedi.');
    expect(fixture.nativeElement.textContent).not.toContain('Bu konuşmanın ilk mesajını gönder.');

    historyFails = false;
    await page.retryMessages();
    fixture.detectChanges();

    expect(page.messageLoadError()).toBe(false);
    expect(page.messages()).toEqual([MESSAGE]);
    expect(fixture.nativeElement.textContent).toContain(MESSAGE.text);
  });

  it('orders message history chronologically and renders deleted state truthfully', async () => {
    const later: MessageView = {
      ...MESSAGE,
      id: 'deleted-message',
      status: 'Deleted',
      text: 'Bu metin gösterilmemeli',
      createdAtUtc: '2026-07-30T07:05:00Z'
    };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listConversations) return { items: [CONVERSATION], nextCursor: null };
      if (operation === listMessages) return { items: [later, MESSAGE], nextCursor: null };
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } },
        {
          provide: MessagingRealtimeService,
          useValue: {
            onMessage: vi.fn(() => () => undefined),
            connect: vi.fn(async () => undefined),
            join: vi.fn(async () => undefined),
            typing: vi.fn(async () => undefined)
          }
        },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(MessagingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.messages().map(item => item.id)).toEqual([MESSAGE.id, later.id]);
    expect(fixture.nativeElement.textContent).toContain('Mesaj silindi');
    expect(fixture.nativeElement.textContent).not.toContain(later.text);
  });

  it('rolls back a failed optimistic send and restores the composed text', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === sendMessage) throw new Error('offline');
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } },
        {
          provide: MessagingRealtimeService,
          useValue: {
            onMessage: vi.fn(() => () => undefined),
            connect: vi.fn(async () => undefined),
            join: vi.fn(async () => undefined),
            typing: vi.fn(async () => undefined)
          }
        },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const page = TestBed.createComponent(MessagingPage).componentInstance;
    page.selected.set(CONVERSATION);
    page.messages.set([MESSAGE]);
    page.composer.controls.text.setValue('Kaybolmaması gereken mesaj');

    await page.send();

    expect(invoke).toHaveBeenCalledWith(sendMessage, {
      conversationId: CONVERSATION.id,
      body: { text: 'Kaybolmaması gereken mesaj', mediaIds: [], replyToId: null }
    });
    expect(page.messages()).toEqual([MESSAGE]);
    expect(page.composer.controls.text.value).toBe('Kaybolmaması gereken mesaj');
    expect(page.message()).toContain('ekler korunarak');
  });

  it('selects the conversation requested by a notification deep link', async () => {
    const requested: ConversationView = { ...CONVERSATION, id: 'requested-conversation', title: 'İstenen konuşma' };
    const invoke = vi.fn(async (operation: unknown, params?: { conversationId?: string }) => {
      if (operation === listConversations) return { items: [CONVERSATION, requested], nextCursor: null };
      if (operation === listMessages) return { items: params?.conversationId === requested.id ? [MESSAGE] : [], nextCursor: null };
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [MessagingPage],
      providers: [
        { provide: Api, useValue: { invoke } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (name: string) => name === 'conversation' ? requested.id : null } } }
        },
        {
          provide: MessagingRealtimeService,
          useValue: {
            onMessage: vi.fn(() => () => undefined),
            connect: vi.fn(async () => undefined),
            join: vi.fn(async () => undefined),
            typing: vi.fn(async () => undefined)
          }
        },
        { provide: TokenVault, useValue: { accessToken: () => null } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(MessagingPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.selected()?.id).toBe(requested.id);
    expect(invoke).toHaveBeenCalledWith(listMessages, { conversationId: requested.id, limit: 100 });
  });

  it('sends a real reply and applies owner edit and delete responses', async () => {
    const sent = { ...MESSAGE, id: 'reply-id', senderId: 'actor', replyToId: MESSAGE.id, text: 'Yanıt', deliveryState: 'Sent' as const };
    const edited = { ...sent, text: 'Düzenlenmiş yanıt', version: 2 };
    const deleted = { ...edited, text: '', mediaIds: [], status: 'Deleted' as const, version: 3 };
    const invoke = vi.fn(async (operation: unknown, params?: { body?: { change?: string } }) => {
      if (operation === sendMessage) return sent;
      if (operation === changeMessage) return params?.body?.change === 'Delete' ? deleted : edited;
      return {};
    });
    const page = await createPage(invoke);
    page.actorId.set('actor'); page.selected.set(CONVERSATION); page.messages.set([MESSAGE]);
    page.replyTo(MESSAGE); page.composer.controls.text.setValue('Yanıt');

    await page.send();
    expect(invoke).toHaveBeenCalledWith(sendMessage, { conversationId: CONVERSATION.id,
      body: { text: 'Yanıt', mediaIds: [], replyToId: MESSAGE.id } });

    page.beginEdit(sent); page.editText.set('Düzenlenmiş yanıt'); await page.saveEdit(sent);
    expect(page.messages().find(item => item.id === sent.id)?.text).toBe('Düzenlenmiş yanıt');
    await page.deleteMessage(edited);
    expect(page.messages().find(item => item.id === sent.id)?.status).toBe('Deleted');
  });

  it('does not restore a failed send into a newly selected conversation', async () => {
    let reject!: (reason?: unknown) => void;
    const pending = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const invoke = vi.fn(async (operation: unknown) => operation === sendMessage ? pending : {});
    const page = await createPage(invoke);
    const other = { ...CONVERSATION, id: 'other-conversation' };
    const otherMessage = { ...MESSAGE, id: 'other-message', conversationId: other.id };
    page.selected.set(CONVERSATION); page.messages.set([MESSAGE]); page.composer.controls.text.setValue('A taslağı');

    const sending = page.send();
    page.selected.set(other); page.messages.set([otherMessage]);
    reject(new Error('offline'));
    await sending;

    expect(page.messages()).toEqual([otherMessage]);
    expect(page.composer.controls.text.value).toBe('');
  });

  it('ignores a stale realtime edit after a newer delete', async () => {
    const page = await createPage(vi.fn());
    const deleted = { ...MESSAGE, status: 'Deleted' as const, text: '', version: 3 };
    const staleEdit = { ...MESSAGE, text: 'eski düzenleme', version: 2 };
    page.messages.set([deleted]);

    (page as unknown as { replaceMessage(value: MessageView): void }).replaceMessage(staleEdit);

    expect(page.messages()[0]).toEqual(deleted);
  });
});

async function createPage(invoke: ReturnType<typeof vi.fn>): Promise<MessagingPage> {
  await TestBed.configureTestingModule({ imports: [MessagingPage], providers: [
    { provide: Api, useValue: { invoke } },
    { provide: MessagingRealtimeService, useValue: { onMessage: vi.fn(() => () => undefined), connect: vi.fn(), join: vi.fn(), typing: vi.fn() } },
    { provide: TokenVault, useValue: { accessToken: () => null } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } }
  ] }).compileComponents();
  return TestBed.createComponent(MessagingPage).componentInstance;
}
