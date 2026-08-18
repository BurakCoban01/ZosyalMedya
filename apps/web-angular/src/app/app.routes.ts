import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'giris', loadComponent: () => import('./features/auth/login.page').then(module => module.LoginPage) },
  { path: 'auth/verify-email', loadComponent: () => import('./features/auth/verify-email.page').then(module => module.VerifyEmailPage) },
  { path: 'auth/reset-password', loadComponent: () => import('./features/auth/reset-password.page').then(module => module.ResetPasswordPage) },
  // Internal design-system gallery (M1 validation surface). Unauthenticated +
  // lazy so it is reachable for token/contrast validation without a session.
  // Production-build gating (VAL-DS-036) is handled at the milestone gate.
  { path: '_design', loadComponent: () => import('./design-system/gallery/gallery-page.component').then(m => m.GalleryPageComponent) },
  {
    path: '', canActivate: [authGuard], loadComponent: () => import('./layout/shell/app-shell.component').then(module => module.ZmAppShellComponent),
    children: [
      { path: 'akis', loadComponent: () => import('./features/feed/feed.page').then(module => module.FeedPage) },
      { path: 'mesajlar', loadComponent: () => import('./features/messaging/messaging.page').then(module => module.MessagingPage) },
      { path: 'bildirimler', loadComponent: () => import('./features/notifications/notifications.page').then(module => module.NotificationsPage) },
      { path: 'profil', loadComponent: () => import('./features/profile/profile.page').then(module => module.ProfilePage) },
      { path: 'profil/:handle', loadComponent: () => import('./features/details/profile-detail.page').then(module => module.ProfileDetailPage) },
      { path: 'icerik/:id', loadComponent: () => import('./features/details/content-detail.page').then(module => module.ContentDetailPage) },
      { path: 'ayarlar', loadComponent: () => import('./features/settings/settings.page').then(module => module.SettingsPage) },
      { path: 'kaydedilenler', loadComponent: () => import('./features/saved/saved.page').then(module => module.SavedPage) },
      { path: 'baglantilar', loadComponent: () => import('./features/social/connections.page').then(module => module.ConnectionsPage) },
      { path: 'sorular', loadComponent: () => import('./features/questions/questions.page').then(module => module.QuestionsPage) },
      { path: 'sorular/:id', loadComponent: () => import('./features/details/question-detail.page').then(module => module.QuestionDetailPage) },
      { path: 'topluluklar/:slug', loadComponent: () => import('./features/details/community-detail.page').then(module => module.CommunityDetailPage) },
      { path: 'kesfet', loadComponent: () => import('./features/discovery/discovery.page').then(module => module.DiscoveryPage) },
      { path: 'yonetim', loadComponent: () => import('./features/operations/operations.page').then(module => module.OperationsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'akis' }
    ]
  },
  { path: '**', redirectTo: '' }
];
