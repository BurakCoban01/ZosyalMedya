import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

type Segment={kind:'text'|'mention'|'hashtag';value:string};

@Component({
  selector:'zm-rich-text',standalone:true,imports:[RouterLink],changeDetection:ChangeDetectionStrategy.OnPush,
  host:{class:'zm-rich-text'},
  styles:[`:host{white-space:pre-wrap;overflow-wrap:anywhere}:host a{color:var(--zm-discovery);font-weight:750;text-decoration:none;text-underline-offset:.18em}:host a:hover{text-decoration:underline}:host a:focus-visible{outline:var(--zm-focus-ring-width) solid var(--zm-focus);outline-offset:var(--zm-focus-ring-offset);border-radius:2px}`],
  template:`@for(segment of segments();track $index){@if(segment.kind==='mention'){<a [routerLink]="['/profil',segment.value]">&#64;{{segment.value}}</a>}@else if(segment.kind==='hashtag'){<a routerLink="/kesfet" [queryParams]="{q:'#'+segment.value}">#{{segment.value}}</a>}@else{<span>{{segment.value}}</span>}}`
})
export class RichTextComponent{
  readonly text=input<string>('');
  readonly segments=computed<Segment[]>(()=>tokenize(this.text()));
}

export function tokenize(value:string):Segment[]{
  const result:Segment[]=[];const pattern=/(^|[^\p{L}\p{N}_])(?:@([\p{L}\p{N}_.]{3,30})(?![\p{L}\p{N}_.])|#([\p{L}\p{N}_]{2,64})(?![\p{L}\p{N}_]))/gu;let cursor=0;let match:RegExpExecArray|null;
  while((match=pattern.exec(value))!==null){const prefixEnd=match.index+match[1].length;if(prefixEnd>cursor)result.push({kind:'text',value:value.slice(cursor,prefixEnd)});result.push({kind:match[2]?'mention':'hashtag',value:match[2]??match[3]});cursor=pattern.lastIndex;}
  if(cursor<value.length)result.push({kind:'text',value:value.slice(cursor)});return result.length?result:[{kind:'text',value}];
}
