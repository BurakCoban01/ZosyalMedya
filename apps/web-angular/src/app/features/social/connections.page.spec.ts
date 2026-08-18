import { TestBed } from '@angular/core/testing';
import { Api, block, getRelationship, RelationshipView, SearchHit } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionsPage } from './connections.page';

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

const RELATIONSHIP: RelationshipView = {
  actorId: 'actor-id',
  followState: 'None',
  isBlocked: false,
  isBlockedByTarget: false,
  isCloseFriend: false,
  isMuted: false,
  targetId: TARGET.ownerId,
  version: 1
};

describe('ConnectionsPage profile selection', () => {
  it('inspects the selected profile owner instead of user-entered identifiers', async () => {
    const invoke = vi.fn(async () => RELATIONSHIP);
    await TestBed.configureTestingModule({
      imports: [ConnectionsPage],
      providers: [{ provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const page = TestBed.createComponent(ConnectionsPage).componentInstance;
    page.selectTarget(TARGET);

    await page.inspect();

    expect(invoke).toHaveBeenCalledWith(getRelationship, { targetId: TARGET.ownerId });
    expect(page.state()).toEqual(RELATIONSHIP);
  });

  it('requires an explicit second step before blocking the selected profile', async () => {
    const blocked = { ...RELATIONSHIP, isBlocked: true, version: 2 };
    const invoke = vi.fn(async (operation: unknown) => operation === block ? blocked : RELATIONSHIP);
    await TestBed.configureTestingModule({
      imports: [ConnectionsPage],
      providers: [{ provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ConnectionsPage);
    const page = fixture.componentInstance;
    page.selectTarget(TARGET);
    page.state.set(RELATIONSHIP);
    fixture.detectChanges();

    page.requestBlock();
    fixture.detectChanges();

    expect(invoke).not.toHaveBeenCalledWith(block, { targetId: TARGET.ownerId });
    expect(fixture.nativeElement.textContent).toContain('Engellemeyi onayla');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('karşılıklı takibi sonlandırır');

    await page.act('block');

    expect(invoke).toHaveBeenCalledWith(block, { targetId: TARGET.ownerId });
    expect(page.state()?.isBlocked).toBe(true);
    expect(page.confirmingBlock()).toBe(false);
  });
});
