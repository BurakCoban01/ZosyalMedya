import { effect, EffectRef, Injectable, NgZone } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { TokenVault } from '../auth/token-vault.service';
import { MessageView, NotificationView } from '@platform/api';
import { environment } from '../../../environments/environment';

export interface RealtimeMessageNotice { messageId: string; conversationId: string; senderId: string; recipientIds: string[]; preview: string; sentAtUtc: string; }
export interface RealtimeReceiptNotice { messageId: string; conversationId: string; userId: string; state: 'Delivered'|'Read'; atUtc: string; }

@Injectable({ providedIn: 'root' })
export class MessagingRealtimeService {
  private readonly connection: HubConnection;
  private readonly listeners = new Set<(notice: RealtimeMessageNotice) => void>();
  private readonly notificationListeners = new Set<(notice: NotificationView) => void>();
  private readonly receiptListeners = new Set<(notice: RealtimeReceiptNotice) => void>();
  private readonly changeListeners = new Set<(notice: MessageView) => void>();
  private connecting: Promise<void> | null = null;
  private desiredConnected=false;
  private sessionRevision=0;
  private currentSubject='';
  private connectionSubject='';
  private readonly sessionSync:EffectRef;

  constructor(private readonly vault: TokenVault, zone: NgZone) {
    this.currentSubject=this.subject(vault.accessToken());
    this.connection = new HubConnectionBuilder()
      .withUrl(`${environment.apiUrl || (typeof location !== 'undefined' ? location.origin : '')}/hubs/messaging`, { accessTokenFactory: () => vault.validAccessToken().then(token => token ?? '') })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();
    this.connection.on('messageReceived', notice => zone.run(() => {if(this.connectionSubject===this.currentSubject)this.listeners.forEach(listener => listener(notice));}));
    this.connection.on('notificationReceived', notice => zone.run(() => {if(this.connectionSubject===this.currentSubject)this.notificationListeners.forEach(listener => listener(notice));}));
    this.connection.on('receiptChanged', notice => zone.run(() => {if(this.connectionSubject===this.currentSubject)this.receiptListeners.forEach(listener => listener(notice));}));
    this.connection.on('messageChanged', notice => zone.run(() => {if(this.connectionSubject===this.currentSubject)this.changeListeners.forEach(listener => listener(notice));}));
    this.sessionSync=effect(()=>{const subject=this.subject(this.vault.accessToken());if(subject===this.currentSubject)return;this.currentSubject=subject;void this.restartForSession(++this.sessionRevision);});
  }

  async connect(): Promise<void> {
    this.desiredConnected=true;
    if (this.connection.state !== HubConnectionState.Disconnected) return;
    this.connectionSubject=this.currentSubject;
    this.connecting ??= this.connection.start().finally(() => { this.connecting = null; });
    await this.connecting;
  }
  async disconnect(): Promise<void> {
    this.desiredConnected=false;++this.sessionRevision;
    const inFlight = this.connecting;
    if (inFlight) await inFlight.catch(() => undefined);
    this.listeners.clear();
    this.notificationListeners.clear();
    this.receiptListeners.clear();
    this.changeListeners.clear();
    if (this.connection.state !== HubConnectionState.Disconnected) {
      await this.connection.stop();
    }
  }
  async join(conversationId: string): Promise<void> { await this.connect(); await this.connection.invoke('JoinConversation', conversationId); }
  async typing(conversationId: string, value: boolean): Promise<void> { if (this.connection.state === HubConnectionState.Connected) await this.connection.invoke('Typing', conversationId, value); }
  onMessage(listener: (notice: RealtimeMessageNotice) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onNotification(listener: (notice: NotificationView) => void): () => void { this.notificationListeners.add(listener); return () => this.notificationListeners.delete(listener); }
  onReceipt(listener: (notice: RealtimeReceiptNotice) => void): () => void { this.receiptListeners.add(listener); return () => this.receiptListeners.delete(listener); }
  onChanged(listener: (notice: MessageView) => void): () => void { this.changeListeners.add(listener); return () => this.changeListeners.delete(listener); }
  private async restartForSession(revision:number):Promise<void>{const inFlight=this.connecting;if(inFlight)await inFlight.catch(()=>undefined);if(revision!==this.sessionRevision)return;if(this.connection.state!==HubConnectionState.Disconnected)await this.connection.stop();this.connectionSubject='';if(revision===this.sessionRevision&&this.desiredConnected&&this.currentSubject)await this.connect().catch(()=>undefined);}
  private subject(token:string|null):string{if(!token)return '';try{const encoded=token.split('.')[1];if(!encoded)return '';const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))).sub??'';}catch{return '';}}
}
