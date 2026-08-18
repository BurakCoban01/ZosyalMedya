import { Routes } from '@angular/router';
import { mobileAuthGuard } from './core/auth/mobile-auth.guard';

export const routes:Routes=[
  {path:'giris',loadComponent:()=>import('./features/auth/mobile-login.page').then(module=>module.MobileLoginPage)},
  {path:'auth/verify-email',loadComponent:()=>import('./features/auth/mobile-verify-email.page').then(module=>module.MobileVerifyEmailPage)},
  {path:'auth/reset-password',loadComponent:()=>import('./features/auth/mobile-reset-password.page').then(module=>module.MobileResetPasswordPage)},
  {path:'',canActivate:[mobileAuthGuard],loadComponent:()=>import('./layout/tabs.page').then(module=>module.TabsPage),children:[
    {path:'akis',loadComponent:()=>import('./features/feed/mobile-feed.page').then(module=>module.MobileFeedPage)},
    {path:'mesajlar',loadComponent:()=>import('./features/messaging/mobile-messaging.page').then(module=>module.MobileMessagingPage)},
    {path:'bildirimler',loadComponent:()=>import('./features/notifications/mobile-notifications.page').then(module=>module.MobileNotificationsPage)},
    {path:'daha-fazla',loadComponent:()=>import('./features/more/mobile-more.page').then(module=>module.MobileMorePage)},
    {path:'profil',loadComponent:()=>import('./features/profile/mobile-profile.page').then(module=>module.MobileProfilePage)},
    {path:'profil/:handle',loadComponent:()=>import('./features/details/mobile-profile-detail.page').then(module=>module.MobileProfileDetailPage)},
    {path:'icerik/:id',loadComponent:()=>import('./features/details/mobile-content-detail.page').then(module=>module.MobileContentDetailPage)},
    {path:'sorular/:id',loadComponent:()=>import('./features/details/mobile-question-detail.page').then(module=>module.MobileQuestionDetailPage)},
    {path:'topluluklar/:slug',loadComponent:()=>import('./features/details/mobile-community-detail.page').then(module=>module.MobileCommunityDetailPage)},
    {path:'ayarlar',loadComponent:()=>import('./features/settings/mobile-settings.page').then(module=>module.MobileSettingsPage)},
    {path:'kaydedilenler',loadComponent:()=>import('./features/saved/mobile-saved.page').then(module=>module.MobileSavedPage)},
    {path:'baglantilar',loadComponent:()=>import('./features/social/mobile-connections.page').then(module=>module.MobileConnectionsPage)},
    {path:'sorular',loadComponent:()=>import('./features/questions/mobile-questions.page').then(module=>module.MobileQuestionsPage)},
    {path:'kesfet',loadComponent:()=>import('./features/discovery/mobile-discovery.page').then(module=>module.MobileDiscoveryPage)},
    {path:'',pathMatch:'full',redirectTo:'akis'}]},
  {path:'**',redirectTo:''}
];
