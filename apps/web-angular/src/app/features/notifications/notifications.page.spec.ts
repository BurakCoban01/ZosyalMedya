import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  Api,
  listNotifications,
  markNotificationRead,
  NotificationView
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MessagingRealtimeService } from '../../core/realtime/messaging-realtime.service';
import { NotificationsPage } from './notifications.page';

const UNREAD: NotificationView = {
  actorId: 'actor-id',
  arguments: {
    actorName: 'Ayşe Yılmaz',
    preview: 'Yeni taslağa göz atabilir misin?'
  },
  bodyTemplateKey: 'notification.message.body',
  count: 1,
  createdAtUtc: new Date().toISOString(),
  deepLink: '/mesajlar?conversation=conversation-id',
  deliveryState: 'Delivered',
  entityId: 'entity-id',
  id: 'notification-1',
  isRead: false,
  templateVersion: 1,
  titleTemplateKey: 'notification.message.title',
  type: 'Message',
  version: 1
};

const READ: NotificationView = {
  ...UNREAD,
  id: 'notification-2',
  isRead: true,
  type: 'Reaction',
  deepLink: '/akis',
  createdAtUtc: new Date(Date.now() - 86_400_000).toISOString()
};

function realtimeStub() {
  return {
    connect: vi.fn(async () => undefined),
    onNotification: vi.fn(() => () => undefined)
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function renderNotifications(
  invoke: ReturnType<typeof vi.fn>,
  navigateByUrl = vi.fn(async (_url: string) => true)
) {
  await TestBed.configureTestingModule({
    imports: [NotificationsPage],
    providers: [
      { provide: Api, useValue: { invoke } },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: MessagingRealtimeService, useValue: realtimeStub() }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(NotificationsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, navigateByUrl };
}

describe('NotificationsPage credible activity states', () => {
  it('groups real rows by date and exposes unread/type cues as text', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listNotifications) return { items: [UNREAD, READ], nextCursor: null };
      return {};
    });
    const { fixture } = await renderNotifications(invoke);
    const groups = fixture.nativeElement.querySelectorAll('.notification-group');

    expect(groups.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Mesaj');
    expect(fixture.nativeElement.textContent).toContain('Okunmadı');
    expect(fixture.nativeElement.textContent).toContain('Ayşe Yılmaz · Yeni taslağa göz atabilir misin?');
    expect(fixture.nativeElement.querySelector('.type-icon svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.type-icon')?.textContent.trim()).toBe('');
  });

  it('marks an unread item and follows a safe internal deep link', async () => {
    const changed = { ...UNREAD, isRead: true, version: 2 };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listNotifications) return { items: [UNREAD], nextCursor: null };
      if (operation === markNotificationRead) return changed;
      return {};
    });
    const { fixture, navigateByUrl } = await renderNotifications(invoke);

    await fixture.componentInstance.open(UNREAD);
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(markNotificationRead, { notificationId: UNREAD.id });
    expect(navigateByUrl).toHaveBeenCalledWith(UNREAD.deepLink);
    expect(fixture.componentInstance.items()[0].isRead).toBe(true);
  });

  it('marks read but refuses protocol-relative navigation', async () => {
    const unsafe = { ...UNREAD, deepLink: '//example.com/path' };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === listNotifications) return { items: [unsafe], nextCursor: null };
      if (operation === markNotificationRead) return { ...unsafe, isRead: true };
      return {};
    });
    const { fixture, navigateByUrl } = await renderNotifications(invoke);

    await fixture.componentInstance.open(unsafe);
    fixture.detectChanges();

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('güvenli bir uygulama bağlantısı olmadığı için');
  });

  it('uses entity context for legacy content, question and follow-request links', async () => {
    const reaction = { ...READ, entityId: 'content-id', deepLink: '/akis' };
    const question = { ...READ, id: 'question-notice', type: 'System' as const, entityId: 'question-id', titleTemplateKey: 'notification.question.title', deepLink: '/sorular' };
    const request = { ...READ, id: 'request-notice', type: 'NewFollower' as const, entityId: 'requester-id', titleTemplateKey: 'notification.follow_request.title', arguments: { actorName: 'Ayse', actorHandle: 'ayse.dev', followState: 'Pending' }, deepLink: '/profil' };
    const invoke = vi.fn(async (operation: unknown) => operation === listNotifications ? { items: [reaction, question, request], nextCursor: null } : {});
    const { fixture, navigateByUrl } = await renderNotifications(invoke);

    await fixture.componentInstance.open(reaction);
    await fixture.componentInstance.open(question);
    await fixture.componentInstance.open(request);

    expect(navigateByUrl.mock.calls.map(call => call[0])).toEqual(['/icerik/content-id','/sorular/question-id','/baglantilar?view=requests']);
    expect(fixture.componentInstance.title(question)).toBe('Yeni soru');
    expect(fixture.componentInstance.title(request)).toBe('Yeni takip iste\u011fi');
  });

  it('shows a recoverable load error instead of an empty success state', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const { fixture } = await renderNotifications(invoke);

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent)
      .toContain('Bildirimler yüklenemedi');
    expect(fixture.nativeElement.textContent).toContain('Tekrar dene');
    expect(fixture.nativeElement.textContent).not.toContain('Her şey güncel');
  });

  it('deduplicates cursor pages by notification id', async () => {
    let page = 0;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation !== listNotifications) return {};
      page += 1;
      return page === 1
        ? { items: [UNREAD], nextCursor: 'next' }
        : { items: [UNREAD, READ], nextCursor: null };
    });
    const { fixture } = await renderNotifications(invoke);

    await fixture.componentInstance.load(true);

    expect(fixture.componentInstance.items().map(item => item.id)).toEqual([
      'notification-1',
      'notification-2'
    ]);
  });

  it('does not let an older refresh overwrite a newer realtime refresh', async () => {
    const older=deferred<{items:NotificationView[];nextCursor:null}>();const newer=deferred<{items:NotificationView[];nextCursor:null}>();let calls=0;
    const invoke=vi.fn((operation:unknown)=>operation===listNotifications?(++calls===1?older.promise:newer.promise):Promise.resolve({}));
    await TestBed.configureTestingModule({imports:[NotificationsPage],providers:[{provide:Api,useValue:{invoke}},{provide:Router,useValue:{navigateByUrl:vi.fn()}},{provide:MessagingRealtimeService,useValue:realtimeStub()}]}).compileComponents();
    const fixture=TestBed.createComponent(NotificationsPage);fixture.detectChanges();
    const refresh=fixture.componentInstance.load(false);newer.resolve({items:[READ],nextCursor:null});await refresh;
    older.resolve({items:[UNREAD],nextCursor:null});await fixture.whenStable();

    expect(fixture.componentInstance.items()).toEqual([READ]);
  });
});
