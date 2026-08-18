import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, ProfileView, getContent, getFeed } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { ProfileTimelineComponent } from './profile-timeline.component';

const PROFILE={id:'profile',ownerId:'owner',handle:'ayse',displayName:'Ayşe',profileMediaId:'avatar',coverMediaId:null,isPrivate:false,isVerified:false,theme:'System',language:'Turkish',reduceMotion:false,completenessPercentage:75,version:1} as ProfileView;
const item=(id:string,mediaIds:string[]=[],originalPostId:string|null=null)=>({content:{id,authorId:'owner',text:`Gönderi ${id}`,visibility:'Public',status:'Published',shareKind:originalPostId?'Quote':'Original',originalPostId,mediaIds,mentions:[],hashtags:[],linkUrl:null,contentWarning:null,isSensitive:false,isPinned:false,publishedAtUtc:'2026-08-13T10:00:00Z',version:1,viewCount:1},author:{ownerId:'owner',handle:'ayse',displayName:'Ayşe',profileMediaId:'avatar',isVerified:false},reactions:{contentId:id,counts:{},viewerReaction:null},commentCount:0,hasPoll:false,score:0,rankingReasons:[]});

async function render(invoke:ReturnType<typeof vi.fn>){await TestBed.configureTestingModule({imports:[ProfileTimelineComponent],providers:[provideRouter([]),{provide:Api,useValue:{invoke}},{provide:MediaResolver,useValue:{resolve:vi.fn().mockRejectedValue(new Error('unavailable'))}}]}).compileComponents();const fixture=TestBed.createComponent(ProfileTimelineComponent);fixture.componentRef.setInput('profile',PROFILE);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return fixture;}

describe('ProfileTimelineComponent',()=>{
  it('loads the exact profile feed and filters actual media posts',async()=>{const invoke=vi.fn(async(operation:unknown)=>operation===getFeed?{items:[item('text'),item('media',['m'])],nextCursor:null,strategy:'chronological-profile'}:null);const fixture=await render(invoke);expect(invoke).toHaveBeenCalledWith(getFeed,{kind:'Profile',profileId:'owner',limit:10,cursor:undefined});expect(fixture.nativeElement.querySelectorAll('zm-post-card')).toHaveLength(2);fixture.componentInstance.tab.set('media');fixture.detectChanges();expect(fixture.nativeElement.querySelectorAll('zm-post-card')).toHaveLength(1);expect(fixture.nativeElement.textContent).toContain('Gönderi media');});
  it('loads visible quote context and exposes an honest retry on initial failure',async()=>{let fail=true;const quote=item('quote',[],'source');const invoke=vi.fn(async(operation:unknown)=>{if(operation===getFeed){if(fail){fail=false;throw new Error('offline');}return{items:[quote],nextCursor:null,strategy:'chronological-profile'};}if(operation===getContent)return{...quote.content,id:'source',text:'Kaynak',shareKind:'Original',originalPostId:null};return null;});const fixture=await render(invoke);expect(fixture.nativeElement.querySelector('[role=alert]')).toBeTruthy();fixture.componentInstance.retry();await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Kaynak');});
});
