import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, deleteMedia, getMyProfile, initiateMedia, ProfileView, updateMyProfile, uploadMediaContent } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { MediaAttachmentPickerComponent } from '../../core/media/media-attachment-picker.component';
import { SessionMediaCleanup } from '../../core/media/session-media-cleanup.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { ShellNavStateService } from '../../layout/shell/navigation/shell-nav-state.service';
import { ProfilePage } from './profile.page';

const PROFILE: ProfileView = {
  biography: 'Ürün ekipleri için erişilebilir deneyimler tasarlıyorum.',
  completenessPercentage: 63,
  coverMediaId: 'cover-media-id',
  displayName: 'Ayşe Yılmaz',
  handle: 'ayse_dev',
  id: 'profile-id',
  isPrivate: false,
  isVerified: true,
  language: 'Turkish',
  location: 'İstanbul',
  organization: 'Zosyal Studio',
  ownerId: 'owner-id',
  profileMediaId: 'profile-media-id',
  reduceMotion: false,
  theme: 'System',
  version: 1,
  websiteUrl: 'https://example.com/ayse'
};

async function renderProfile(invoke: ReturnType<typeof vi.fn>) {
  const syncProfile = vi.fn();
  await TestBed.configureTestingModule({
    imports: [ProfilePage],
    providers: [
      provideRouter([]),
      { provide: Api, useValue: { invoke } },
      { provide: MediaResolver, useValue: { resolve: vi.fn().mockRejectedValue(new Error('unavailable')), sessionRevision: signal(0) } },
      { provide: SessionMediaCleanup, useValue: { delete: vi.fn().mockResolvedValue(true) } },
      { provide: TokenVault, useValue: { accessToken: () => null, registerBeforeSessionChange: () => vi.fn() } },
      {
        provide: ShellNavStateService,
        useValue: {
          loadProfile: () => invoke(getMyProfile),
          syncProfile
        }
      }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(ProfilePage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, syncProfile };
}

describe('ProfilePage read-first identity', () => {
  it('shows the real profile summary before exposing the edit form', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getMyProfile) return PROFILE;
      if (operation === updateMyProfile) return PROFILE;
      return {};
    });
    const { fixture } = await renderProfile(invoke);

    expect(fixture.nativeElement.querySelector('.completion')?.textContent).toContain('63%');
    expect(fixture.nativeElement.textContent).not.toContain('25%');
    expect(fixture.nativeElement.querySelector('.profile-summary')?.textContent).toContain('Ayşe Yılmaz');
    expect(fixture.nativeElement.querySelector('.profile-summary')?.textContent).toContain('Doğrulanmış');
    expect(fixture.nativeElement.querySelector('.profile-summary')?.textContent).toContain('Zosyal Studio');
    expect(fixture.nativeElement.querySelector('.profile-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="https://example.com/ayse"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/profil/ayse_dev"]')?.textContent).toContain('Herkese açık görünüm');
  });

  it('opens editing only after the explicit profile action', async () => {
    const invoke = vi.fn(async () => PROFILE);
    const { fixture } = await renderProfile(invoke);

    const edit = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: unknown) => (button as HTMLButtonElement).textContent?.includes('Profili düzenle')) as HTMLButtonElement;
    edit.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.profile-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[formcontrolname="displayName"]').value).toBe('Ayşe Yılmaz');
  });

  it('preserves existing profile and cover media ids while saving text fields', async () => {
    let updateParams: { body?: { profileMediaId?: string | null; coverMediaId?: string | null } } | undefined;
    const invoke = vi.fn(async (operation: unknown, params?: typeof updateParams) => {
      if (operation === getMyProfile) return PROFILE;
      if (operation === updateMyProfile) {
        updateParams = params;
        return PROFILE;
      }
      return {};
    });
    const { fixture, syncProfile } = await renderProfile(invoke);
    fixture.componentInstance.beginEdit();
    fixture.detectChanges();

    await fixture.componentInstance.save();
    fixture.detectChanges();

    expect(updateParams?.body?.profileMediaId).toBe('profile-media-id');
    expect(updateParams?.body?.coverMediaId).toBe('cover-media-id');
    expect(syncProfile).toHaveBeenLastCalledWith(PROFILE);
    expect(fixture.nativeElement.textContent).toContain('Profil güncellendi.');
    expect(fixture.nativeElement.querySelector('.profile-form')).toBeNull();
  });

  it('uploads one real image replacement, locks privacy and preserves previously committed media', async () => {
    const replacement={id:'new-avatar',fileName:'avatar.png',contentType:'image/png',size:5,visibility:'Public',status:'Ready',urls:{'w960.webp':'/media/new-avatar'},createdAtUtc:'2026-08-13T10:00:00Z',version:3};
    let updateBody: {profileMediaId?:string|null;coverMediaId?:string|null}|undefined;
    const invoke=vi.fn(async(operation:unknown,params?:{body?:Record<string,unknown>;id?:string})=>{
      if(operation===getMyProfile)return PROFILE;
      if(operation===initiateMedia)return{media:{...replacement,status:'Pending'},uploadUrl:'/upload',expiresAtUtc:'2026-08-13T11:00:00Z'};
      if(operation===uploadMediaContent)return replacement;
      if(operation===updateMyProfile){updateBody=params?.body as typeof updateBody;return{...PROFILE,profileMediaId:'new-avatar'};}
      if(operation===deleteMedia)return undefined;
      return {};
    });
    const {fixture}=await renderProfile(invoke);fixture.componentInstance.beginEdit();fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.isPrivate.disabled).toBe(true);
    const picker=fixture.debugElement.queryAll(node=>node.componentInstance instanceof MediaAttachmentPickerComponent)[0].componentInstance as MediaAttachmentPickerComponent;
    const input=document.createElement('input');Object.defineProperty(input,'files',{value:[new File(['image'],'avatar.png',{type:'image/png'})]});await picker.chooseFiles({target:input} as unknown as Event);fixture.detectChanges();
    await fixture.componentInstance.save();fixture.detectChanges();
    expect(updateBody?.profileMediaId).toBe('new-avatar');expect(updateBody?.coverMediaId).toBe('cover-media-id');expect(invoke).not.toHaveBeenCalledWith(deleteMedia,{id:'profile-media-id'});
  });

  it('shows the creation form only when the API confirms no profile exists', async () => {
    const invoke = vi.fn(async () => { throw { status: 404 }; });
    const { fixture } = await renderProfile(invoke);

    expect(fixture.nativeElement.querySelector('.completion')).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-form')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Profilini oluştur');
  });

  it('offers retry instead of claiming a missing profile on a transport failure', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const { fixture } = await renderProfile(invoke);

    expect(fixture.nativeElement.querySelector('.profile-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Profil yüklenemedi');
    expect(fixture.nativeElement.textContent).toContain('Tekrar dene');
  });
});
