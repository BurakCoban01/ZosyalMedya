import { TestBed } from '@angular/core/testing';
import { Api,createModerationReport } from '@platform/api';
import { describe,expect,it,vi } from 'vitest';
import { ReportActionComponent } from './report-action.component';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}

async function mount(invoke:ReturnType<typeof vi.fn>){
  await TestBed.configureTestingModule({imports:[ReportActionComponent],providers:[{provide:Api,useValue:{invoke}}]}).compileComponents();
  const fixture=TestBed.createComponent(ReportActionComponent);
  fixture.componentRef.setInput('subjectType','Content');fixture.componentRef.setInput('subjectId','content-id');fixture.detectChanges();
  return fixture;
}

describe('ReportActionComponent',()=>{
  it('submits its real contextual subject without a UUID input',async()=>{
    const invoke=vi.fn().mockResolvedValue({id:'report'});const fixture=await mount(invoke);
    fixture.componentInstance.details.set('Bağlamsal rapor açıklaması');await fixture.componentInstance.submit(new Event('submit'));
    expect(invoke).toHaveBeenCalledWith(createModerationReport,{body:{subjectType:'Content',subjectId:'content-id',reason:'Other',details:'Bağlamsal rapor açıklaması',evidenceReferences:[]}});
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });

  it('does not apply a delayed result after the contextual subject changes',async()=>{
    const pending=deferred<{id:string}>();const invoke=vi.fn().mockReturnValue(pending.promise);const fixture=await mount(invoke);
    fixture.componentInstance.details.set('İlk hedef için açıklama');const submission=fixture.componentInstance.submit(new Event('submit'));
    fixture.componentRef.setInput('subjectId','other-content-id');fixture.detectChanges();

    expect(fixture.componentInstance.sending()).toBe(false);expect(fixture.componentInstance.message()).toBe('');
    pending.resolve({id:'report'});await submission;

    expect(fixture.componentInstance.message()).toBe('');expect(fixture.componentInstance.failed()).toBe(false);
    expect(invoke).toHaveBeenCalledWith(createModerationReport,{body:expect.objectContaining({subjectId:'content-id'})});
  });
});
