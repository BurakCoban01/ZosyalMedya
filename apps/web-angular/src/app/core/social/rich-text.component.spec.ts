import { TestBed } from '@angular/core/testing';import { provideRouter } from '@angular/router';import { describe,expect,it } from 'vitest';import { RichTextComponent,tokenize } from './rich-text.component';
describe('RichTextComponent',()=>{
  it('tokenizes the owned mention and hashtag grammar without partial or email links',()=>{
    expect(tokenize('Merhaba @first.last ve #Ürün!')).toEqual([{kind:'text',value:'Merhaba '},{kind:'mention',value:'first.last'},{kind:'text',value:' ve '},{kind:'hashtag',value:'Ürün'},{kind:'text',value:'!'}]);
    for(const text of ['mail@test.com','@ab',`@${'a'.repeat(31)}`,'#x'])expect(tokenize(text)).toEqual([{kind:'text',value:text}]);
  });
  it('renders profile and discovery router links',async()=>{await TestBed.configureTestingModule({imports:[RichTextComponent],providers:[provideRouter([])]}).compileComponents();const fixture=TestBed.createComponent(RichTextComponent);fixture.componentRef.setInput('text','@ayse #tasarım');fixture.detectChanges();const links=[...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];expect(links.map(x=>x.getAttribute('href'))).toEqual(['/profil/ayse','/kesfet?q=%23tasar%C4%B1m']);expect(fixture.nativeElement.querySelector('[innerhtml]')).toBeNull();});
});
