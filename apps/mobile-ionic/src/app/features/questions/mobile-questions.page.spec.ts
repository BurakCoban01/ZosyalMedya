import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,provideRouter } from '@angular/router';
import { Api,askQuestion,deleteQuestion,getProfileByHandle,getQuestionInbox,QuestionView,SearchHit } from '@platform/api';
import { BehaviorSubject } from 'rxjs';
import { describe,expect,it,vi } from 'vitest';
import { MobileQuestionsPage } from './mobile-questions.page';

const QUESTION:QuestionView={id:'question',targetId:'owner',senderId:null,body:'Gerçek soru',isAnonymous:true,audience:'Public',status:'Answered',answer:'Gerçek yanıt',publishAtUtc:null,answeredAtUtc:'2026-08-14T00:00:00Z',createdAtUtc:'2026-08-14T00:00:00Z',version:2};

async function render(invoke:ReturnType<typeof vi.fn>,query:Record<string,string>={},settle=true){
  const params=new BehaviorSubject(convertToParamMap(query));
  await TestBed.configureTestingModule({imports:[MobileQuestionsPage],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{queryParamMap:params.asObservable()}},{provide:Api,useValue:{invoke}}]}).compileComponents();
  const fixture=TestBed.createComponent(MobileQuestionsPage);fixture.detectChanges();if(settle){await fixture.whenStable();fixture.detectChanges();}return{fixture,page:fixture.componentInstance,params};
}

describe('MobileQuestionsPage',()=>{
  it('preselects the linked profile and sends the selected audience',async()=>{
    const profile={id:'profile',ownerId:'target',handle:'ayse',displayName:'Ayşe'};
    const invoke=vi.fn(async(operation:unknown)=>operation===getQuestionInbox?[]:operation===getProfileByHandle?profile:{});
    const {page}=await render(invoke,{profil:'ayse'});expect(page.target()?.ownerId).toBe('target');
    page.form.setValue({body:'Herkese açık soru',audience:'Public',isAnonymous:true});await page.ask();
    expect(invoke).toHaveBeenCalledWith(askQuestion,{body:{body:'Herkese açık soru',audience:'Public',isAnonymous:true,targetId:'target',isDraft:false,publishAtUtc:null}});
  });

  it('deletes an owner question and invalidates an older inbox load',async()=>{
    let release!:(items:QuestionView[])=>void;const delayed=new Promise<QuestionView[]>(resolve=>release=resolve);let inboxCalls=0;
    const invoke=vi.fn((operation:unknown)=>operation===getQuestionInbox?(++inboxCalls===1?Promise.resolve([]):delayed):operation===deleteQuestion?Promise.resolve({...QUESTION,status:'Deleted'}):Promise.resolve({}));
    const {page}=await render(invoke);page.questions.set([QUESTION]);const loading=page.load();await page.remove(QUESTION);release([QUESTION]);await loading;
    expect(page.questions()).toEqual([]);expect(invoke).toHaveBeenCalledWith(deleteQuestion,{id:QUESTION.id});
  });

  it('ignores a stale linked-profile response after the query is cleared',async()=>{
    let release!:(profile:unknown)=>void;const delayed=new Promise(resolve=>release=resolve);
    const invoke=vi.fn((operation:unknown)=>operation===getQuestionInbox?Promise.resolve([]):operation===getProfileByHandle?delayed:Promise.resolve({}));
    const {page,params}=await render(invoke,{profil:'eski'},false);params.next(convertToParamMap({}));release({id:'p',ownerId:'old',handle:'eski',displayName:'Eski'});await delayed;await Promise.resolve();
    expect(page.target()).toBeNull();
  });

  it('clears the previous target while a replacement profile fails to resolve',async()=>{
    let rejectProfile!:(reason?:unknown)=>void;const delayed=new Promise<never>((_resolve,reject)=>rejectProfile=reject);
    const invoke=vi.fn((operation:unknown)=>operation===getQuestionInbox?Promise.resolve([]):operation===getProfileByHandle?delayed:Promise.resolve({}));
    const {fixture,page,params}=await render(invoke,{},false);const previous:SearchHit={id:'old',ownerId:'old',type:'Profile',title:'Eski',snippet:'@eski',deepLink:'/profil/eski',matchedTags:[],score:1};
    page.target.set(previous);fixture.detectChanges();params.next(convertToParamMap({profil:'yeni'}));fixture.detectChanges();
    expect(page.target()).toBeNull();expect(page.profilePicker()?.selected()).toBeNull();
    rejectProfile(new Error('not found'));await delayed.catch(()=>undefined);await Promise.resolve();
    expect(page.target()).toBeNull();
  });
});
