import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, ellipsisHorizontalOutline, homeOutline, notificationsOutline, personOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `<ion-tabs><ion-tab-bar slot="bottom">
    <ion-tab-button tab="akis" href="/akis"><ion-icon name="home-outline"></ion-icon><ion-label>Akış</ion-label></ion-tab-button>
    <ion-tab-button tab="mesajlar" href="/mesajlar"><ion-icon name="chatbubbles-outline"></ion-icon><ion-label>Mesajlar</ion-label></ion-tab-button>
    <ion-tab-button tab="bildirimler" href="/bildirimler"><ion-icon name="notifications-outline"></ion-icon><ion-label>Bildirim</ion-label></ion-tab-button>
    <ion-tab-button tab="profil" href="/profil"><ion-icon name="person-outline"></ion-icon><ion-label>Profil</ion-label></ion-tab-button>
    <ion-tab-button tab="daha-fazla" href="/daha-fazla"><ion-icon name="ellipsis-horizontal-outline"></ion-icon><ion-label>Daha fazla</ion-label></ion-tab-button>
  </ion-tab-bar></ion-tabs>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabsPage {
  constructor() { addIcons({ homeOutline, chatbubblesOutline, notificationsOutline, personOutline, ellipsisHorizontalOutline }); }
}
