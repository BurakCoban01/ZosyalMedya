import { TestBed } from '@angular/core/testing';
import {
  Api,
  FeatureFlagView,
  listModerationCases,
  ModerationCaseView,
  OperationsDashboard,
  operationsDashboard,
  setFeatureFlag
} from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { TokenVault } from '../../core/auth/token-vault.service';
import { OperationsPage } from './operations.page';

const FLAG: FeatureFlagView = {
  description: 'Yeni akış düzenini sınırlar.',
  enabled: false,
  key: 'feed.next',
  rolloutPercentage: 0,
  version: 1
};

const DASHBOARD: OperationsDashboard = {
  backgroundJobs: ['OutboxDispatcher'],
  flags: [FLAG],
  metrics: { pendingOutbox: 2 },
  settings: [{
    description: 'Gizli yapılandırma',
    key: 'security.internal',
    valueJson: '{"secret":"render edilmemeli"}',
    version: 1
  }]
};

const CASE: ModerationCaseView = {
  actions: [],
  appealStatus: 'None',
  assignedModeratorId: null,
  id: 'case-raw-id',
  reportId: 'report-raw-id',
  status: 'Open',
  subjectId: 'subject-raw-id',
  subjectType: 'Content',
  targetUserId: 'target-raw-id',
  updatedAtUtc: '2026-07-30T06:00:00Z',
  version: 1
};

async function renderOperations(invoke: ReturnType<typeof vi.fn>, isAdministrator = true) {
  await TestBed.configureTestingModule({
    imports: [OperationsPage],
    providers: [
      { provide: Api, useValue: { invoke } },
      { provide: TokenVault, useValue: { hasRole: vi.fn(() => isAdministrator) } }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(OperationsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('OperationsPage permission-safe controls', () => {
  it('does not request protected resources for a known non-administrator', async () => {
    const invoke = vi.fn();
    const fixture = await renderOperations(invoke, false);

    expect(invoke).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.permission-panel')?.textContent)
      .toContain('yetkin yok');
  });

  it('shows denial and no protected controls after a 403', async () => {
    const invoke = vi.fn(async () => { throw { status: 403 }; });
    const fixture = await renderOperations(invoke);

    expect(fixture.nativeElement.querySelector('.permission-panel')?.textContent)
      .toContain('Bu alan için yetkin yok');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.metrics')).toBeNull();
  });

  it('renders authorized summaries without sensitive setting values or raw case ids', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === operationsDashboard) return DASHBOARD;
      if (operation === listModerationCases) return [CASE];
      return {};
    });
    const fixture = await renderOperations(invoke);

    expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('İçerik incelemesi');
    expect(fixture.nativeElement.textContent).toContain('Açık vaka');
    expect(fixture.nativeElement.textContent).not.toContain('render edilmemeli');
    expect(fixture.nativeElement.textContent).not.toContain('case-raw-id');
    expect(fixture.nativeElement.textContent).not.toContain('target-raw-id');
  });

  it('presents every domain case status and subject with product copy', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === operationsDashboard) return DASHBOARD;
      if (operation === listModerationCases) return [];
      return {};
    });
    const fixture = await renderOperations(invoke);
    const page = fixture.componentInstance;

    expect(page.subjectLabel('User')).toBe('Hesap incelemesi');
    expect(page.subjectLabel('Question')).toBe('Soru incelemesi');
    expect(page.statusLabel('InReview')).toBe('İnceleniyor');
    expect(page.statusLabel('Appealed')).toBe('İtiraz incelemede');
    expect(page.statusLabel('Closed')).toBe('Kapatıldı');
    expect(page.actionSummary(['TemporaryPublishRestriction']))
      .toBe('Geçici yayınlama kısıtlaması');
    expect(page.actionSummary([])).toBe('Henüz yaptırım yok');
  });

  it('does not write a flag until the separate confirmation action', async () => {
    const changed: FeatureFlagView = {
      ...FLAG,
      enabled: true,
      rolloutPercentage: 25,
      version: 2
    };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === operationsDashboard) return DASHBOARD;
      if (operation === listModerationCases) return [CASE];
      if (operation === setFeatureFlag) return changed;
      return {};
    });
    const fixture = await renderOperations(invoke);
    fixture.componentInstance.flagForm.setValue({
      key: 'feed.next',
      description: 'Yeni akış düzenini sınırlar.',
      rollout: 25,
      enabled: true
    });

    fixture.componentInstance.requestFlagSave();
    fixture.detectChanges();

    expect(invoke.mock.calls.some(call => call[0] === setFeatureFlag)).toBe(false);
    expect(fixture.nativeElement.querySelector('.confirmation')?.textContent)
      .toContain('Onayla ve uygula');

    await fixture.componentInstance.confirmFlagSave();
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(setFeatureFlag, {
      key: 'feed.next',
      body: {
        description: 'Yeni akış düzenini sınırlar.',
        enabled: true,
        rolloutPercentage: 25
      }
    });
    expect(fixture.componentInstance.dashboard()?.flags[0]).toEqual(changed);
    expect(fixture.nativeElement.textContent).toContain('denetim izine eklendi');
  });

  it('closes protected controls if permission is lost during a write', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === operationsDashboard) return DASHBOARD;
      if (operation === listModerationCases) return [CASE];
      if (operation === setFeatureFlag) throw { status: 403 };
      return {};
    });
    const fixture = await renderOperations(invoke);
    fixture.componentInstance.flagForm.setValue({
      key: 'feed.next',
      description: 'Yeni akış düzenini sınırlar.',
      rollout: 25,
      enabled: true
    });
    fixture.componentInstance.requestFlagSave();

    await fixture.componentInstance.confirmFlagSave();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.permission-panel')).toBeTruthy();
  });

  it('shows retry for a non-permission load failure', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const fixture = await renderOperations(invoke);

    expect(fixture.nativeElement.querySelector('.error-panel')?.textContent)
      .toContain('Operasyon verisi yüklenemedi');
    expect(fixture.nativeElement.textContent).toContain('Tekrar dene');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});
