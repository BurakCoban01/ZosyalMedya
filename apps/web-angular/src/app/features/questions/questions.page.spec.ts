import { TestBed } from '@angular/core/testing';
import { Api, askQuestion, deleteQuestion, getProfileByHandle, getQuestionInbox, QuestionView, SearchHit } from '@platform/api';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { QuestionsPage } from './questions.page';

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

describe('QuestionsPage profile selection', () => {
  it('preselects the real profile requested by the profile CTA', async () => {
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === getQuestionInbox) return [];
      if (operation === getProfileByHandle) return { id: TARGET.id, ownerId: TARGET.ownerId, handle: 'ayse_dev', displayName: TARGET.title };
      return {};
    });
    await TestBed.configureTestingModule({
      imports: [QuestionsPage],
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { invoke } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'profil' ? 'ayse_dev' : null } } } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(QuestionsPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(getProfileByHandle, { handle: 'ayse_dev' });
    expect(fixture.componentInstance.target()?.ownerId).toBe(TARGET.ownerId);
    expect((fixture.nativeElement.querySelector('.ask-disclosure') as HTMLDetailsElement).open).toBe(true);
  });

  it('sends the question to the selected real profile owner', async () => {
    const invoke = vi.fn(async () => ({}));
    await TestBed.configureTestingModule({
      imports: [QuestionsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const page = TestBed.createComponent(QuestionsPage).componentInstance;
    page.selectTarget(TARGET);
    page.askForm.controls.body.setValue('Erişilebilirlik testlerini nasıl planlıyorsun?');
    page.askForm.controls.audience.setValue('Followers');
    page.askForm.controls.isAnonymous.setValue(false);

    await page.ask();

    expect(invoke).toHaveBeenCalledWith(askQuestion, {
      body: {
        body: 'Erişilebilirlik testlerini nasıl planlıyorsun?',
        audience: 'Followers',
        isAnonymous: false,
        targetId: TARGET.ownerId,
        isDraft: false,
        publishAtUtc: null
      }
    });
    expect(page.message()).toContain('Ayşe Yılmaz');
  });

  it('keeps the ask flow collapsed while the inbox remains primary', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getQuestionInbox ? [] : {});
    await TestBed.configureTestingModule({
      imports: [QuestionsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(QuestionsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const disclosure = fixture.nativeElement.querySelector('.ask-disclosure') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('summary')?.textContent).toContain('Yeni soru sor');
    expect(fixture.nativeElement.textContent).toContain('Bu filtrede soru yok.');
  });

  it('shows a retryable error instead of a false empty inbox', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    await TestBed.configureTestingModule({
      imports: [QuestionsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(QuestionsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Sorular yüklenemedi.');
    expect(fixture.nativeElement.textContent).not.toContain('Bu filtrede soru yok.');
  });

  it('keeps anonymous identity hidden and links an open sender truthfully', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === getQuestionInbox ? [
      { id:'anonymous',targetId:'target',senderId:null,body:'Anonim soru',isAnonymous:true,audience:'Profile',status:'Published',answer:null,publishAtUtc:null,answeredAtUtc:null,createdAtUtc:'2026-08-13T08:00:00Z',version:1 },
      { id:'open',targetId:'target',senderId:'sender',sender:{ownerId:'sender',handle:'acik_gonderen',displayName:'Açık Gönderen',profileMediaId:null,isVerified:false},body:'Açık soru',isAnonymous:false,audience:'Followers',status:'Answered',answer:'Gerçek yanıt',publishAtUtc:null,answeredAtUtc:'2026-08-13T09:00:00Z',createdAtUtc:'2026-08-13T08:30:00Z',version:2 }
    ] : {});
    await TestBed.configureTestingModule({
      imports: [QuestionsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(QuestionsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const articles = fixture.nativeElement.querySelectorAll('.inbox article');
    expect(articles[0].textContent).toContain('Anonim gönderici · kimlik bilgisi paylaşılmaz.');
    expect(articles[0].querySelector('.sender a')).toBeNull();
    expect(articles[1].querySelector('.sender a')?.getAttribute('href')).toBe('/profil/acik_gonderen');
    expect(articles[1].textContent).toContain('Takipçiler');
    expect(articles[1].querySelector('.detail-link')?.getAttribute('href')).toBe('/sorular/open');
  });

  it('requires explicit confirmation and removes a question through the real delete operation', async () => {
    const question:QuestionView={id:'question',targetId:'target',senderId:null,body:'Silinecek anonim soru',isAnonymous:true,audience:'Profile',status:'Published',answer:null,publishAtUtc:null,answeredAtUtc:null,createdAtUtc:'2026-08-13T08:00:00Z',version:1};
    const invoke=vi.fn(async(operation:unknown)=>operation===getQuestionInbox?[question]:operation===deleteQuestion?{...question,status:'Deleted',body:'',version:2}:{});
    await TestBed.configureTestingModule({imports:[QuestionsPage],providers:[provideRouter([]),{provide:Api,useValue:{invoke}}]}).compileComponents();
    const fixture=TestBed.createComponent(QuestionsPage);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

    (fixture.nativeElement.querySelector('.question-actions .danger') as HTMLButtonElement).click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.delete-confirm')?.textContent).toContain('kalıcı olarak gizlensin mi');
    (fixture.nativeElement.querySelector('.delete-confirm .danger') as HTMLButtonElement).click();await fixture.whenStable();fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(deleteQuestion,{id:question.id});
    expect(fixture.nativeElement.textContent).not.toContain(question.body);
  });

  it('does not let a stale inbox response resurrect a successfully deleted question', async () => {
    const question:QuestionView={id:'question',targetId:'target',senderId:null,body:'Yarıştaki soru',isAnonymous:true,audience:'Profile',status:'Published',answer:null,publishAtUtc:null,answeredAtUtc:null,createdAtUtc:'2026-08-13T08:00:00Z',version:1};
    let finishList!:(items:QuestionView[])=>void;const list=new Promise<QuestionView[]>(resolve=>{finishList=resolve;});
    const invoke=vi.fn(async(operation:unknown)=>operation===getQuestionInbox?list:operation===deleteQuestion?{...question,status:'Deleted',body:'',version:2}:{});
    await TestBed.configureTestingModule({imports:[QuestionsPage],providers:[provideRouter([]),{provide:Api,useValue:{invoke}}]}).compileComponents();
    const page=TestBed.createComponent(QuestionsPage).componentInstance;

    const loading=page.load();page.questions.set([question]);await page.remove(question);finishList([question]);await loading;

    expect(page.questions()).toEqual([]);
  });
});
