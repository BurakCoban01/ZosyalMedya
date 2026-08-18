import { HttpBackend, HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, computed, signal } from '@angular/core';
import { refresh, TokenPair } from '@platform/api';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SecureTokenStorage { read():TokenPair|null; write(tokens:TokenPair):void; clear():void; }
export const SECURE_TOKEN_STORAGE=new InjectionToken<SecureTokenStorage>('SECURE_TOKEN_STORAGE',{
  providedIn:'root',
  factory:()=>new BrowserMemoryTokenStorage()
});

/** Browser/PWA fallback. Native shells must provide SECURE_TOKEN_STORAGE with a platform keystore adapter. */
export class BrowserMemoryTokenStorage implements SecureTokenStorage{
  private tokens:TokenPair|null=null;
  read():TokenPair|null{return this.tokens;}
  write(tokens:TokenPair):void{this.tokens=tokens;}
  clear():void{this.tokens=null;}
}

@Injectable({providedIn:'root'})
export class MobileSession{
  private readonly state=signal<TokenPair|null>(null);
  private readonly rawHttp:HttpClient;
  private rotation:Promise<string|null>|null=null;
  private sessionEpoch=0;
  readonly accessToken=computed(()=>this.state()?.accessToken??null);
  readonly subject=computed(()=>this.readSubject(this.accessToken()));
  readonly authenticated=computed(()=>this.accessToken()!==null);
  constructor(@Inject(SECURE_TOKEN_STORAGE) private readonly storage:SecureTokenStorage,backend:HttpBackend){this.state.set(storage.read());this.rawHttp=new HttpClient(backend);}
  set(tokens:TokenPair):void{++this.sessionEpoch;this.storage.write(tokens);this.state.set(tokens);}
  tokens():TokenPair|null{return this.state();}
  clear():void{++this.sessionEpoch;this.storage.clear();this.state.set(null);}
  rotate():Promise<string|null>{const current=this.state();if(!current)return Promise.resolve(null);if(!this.rotation){const epoch=this.sessionEpoch;const sourceRefreshToken=current.refreshToken;this.rotation=firstValueFrom(refresh(this.rawHttp,environment.apiUrl,{body:{refreshToken:sourceRefreshToken}})).then(response=>{if(epoch!==this.sessionEpoch||this.state()?.refreshToken!==sourceRefreshToken)return null;this.set(response.body);return response.body.accessToken;}).catch(()=>{if(epoch===this.sessionEpoch&&this.state()?.refreshToken===sourceRefreshToken)this.clear();return null;}).finally(()=>{this.rotation=null;});}return this.rotation;}
  validAccessToken(minValidityMs=30_000):Promise<string|null>{const current=this.state();if(!current)return Promise.resolve(null);const expiresAt=Date.parse(current.accessTokenExpiresAtUtc);return Number.isFinite(expiresAt)&&expiresAt-Date.now()>minValidityMs?Promise.resolve(current.accessToken):this.rotate();}
  private readSubject(token:string|null):string|null{if(!token)return null;try{const payload=token.split('.')[1];if(!payload)return null;const normalized=payload.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(payload.length/4)*4,'=');const value=JSON.parse(globalThis.atob(normalized)) as {sub?:unknown};return typeof value.sub==='string'&&value.sub.length>0?value.sub:null;}catch{return null;}}
}
