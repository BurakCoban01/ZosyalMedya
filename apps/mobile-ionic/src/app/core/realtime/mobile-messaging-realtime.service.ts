import { effect, EffectRef, Injectable, NgZone } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { MobileSession } from '../auth/secure-token-storage';
import { MessageView, NotificationView } from '@platform/api';
import { environment } from '../../../environments/environment';

export interface MobileMessageNotice { messageId:string;conversationId:string;senderId:string;preview:string;sentAtUtc:string; }
export interface MobileReceiptNotice { messageId:string;conversationId:string;userId:string;state:'Delivered'|'Read';atUtc:string; }
@Injectable({providedIn:'root'})
export class MobileMessagingRealtimeService{
  private readonly connection:HubConnection;private readonly listeners=new Set<(notice:MobileMessageNotice)=>void>();private readonly notificationListeners=new Set<(notice:NotificationView)=>void>();private readonly receiptListeners=new Set<(notice:MobileReceiptNotice)=>void>();private readonly changeListeners=new Set<(notice:MessageView)=>void>();private connecting:Promise<void>|null=null;private desiredConnected=false;private sessionRevision=0;private currentSubject:string|null;private connectionSubject:string|null=null;private readonly sessionSync:EffectRef;
  constructor(private readonly session:MobileSession,zone:NgZone){this.currentSubject=session.subject();this.connection=new HubConnectionBuilder().withUrl(`${environment.apiUrl||location.origin}/hubs/messaging`,{accessTokenFactory:()=>session.accessToken()??''}).withAutomaticReconnect([0,2000,5000,10000,30000]).build();this.connection.on('messageReceived',notice=>zone.run(()=>{if(this.connectionSubject===this.currentSubject)this.listeners.forEach(listener=>listener(notice));}));this.connection.on('notificationReceived',notice=>zone.run(()=>{if(this.connectionSubject===this.currentSubject)this.notificationListeners.forEach(listener=>listener(notice));}));this.connection.on('receiptChanged',notice=>zone.run(()=>{if(this.connectionSubject===this.currentSubject)this.receiptListeners.forEach(listener=>listener(notice));}));this.connection.on('messageChanged',notice=>zone.run(()=>{if(this.connectionSubject===this.currentSubject)this.changeListeners.forEach(listener=>listener(notice));}));this.sessionSync=effect(()=>{const subject=this.session.subject();if(subject===this.currentSubject)return;this.currentSubject=subject;void this.restartForSession(++this.sessionRevision);});}
  async connect():Promise<void>{this.desiredConnected=true;if(this.connection.state!==HubConnectionState.Disconnected)return;this.connectionSubject=this.currentSubject;this.connecting??=this.connection.start().finally(()=>this.connecting=null);await this.connecting;}
  async join(id:string):Promise<void>{await this.connect();await this.connection.invoke('JoinConversation',id);}
  onMessage(listener:(notice:MobileMessageNotice)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  onNotification(listener:(notice:NotificationView)=>void):()=>void{this.notificationListeners.add(listener);return()=>this.notificationListeners.delete(listener);}
  onReceipt(listener:(notice:MobileReceiptNotice)=>void):()=>void{this.receiptListeners.add(listener);return()=>this.receiptListeners.delete(listener);}
  onChanged(listener:(notice:MessageView)=>void):()=>void{this.changeListeners.add(listener);return()=>this.changeListeners.delete(listener);}
  private async restartForSession(revision:number):Promise<void>{const inFlight=this.connecting;if(inFlight)await inFlight.catch(()=>undefined);if(revision!==this.sessionRevision)return;if(this.connection.state!==HubConnectionState.Disconnected)await this.connection.stop();this.connectionSubject=null;if(revision===this.sessionRevision&&this.desiredConnected&&this.currentSubject)await this.connect().catch(()=>undefined);}
}
