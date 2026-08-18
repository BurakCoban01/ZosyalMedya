import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, RouteReuseStrategy, withPreloading, PreloadAllModules } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { IonicRouteStrategy } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideApiConfiguration } from '@platform/api';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { mobileAuthInterceptor } from './app/core/auth/mobile-auth.interceptor';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent,{providers:[
  provideIonicAngular({mode:'ios'}),{provide:RouteReuseStrategy,useClass:IonicRouteStrategy},
  provideRouter(routes,withPreloading(PreloadAllModules)),provideHttpClient(withInterceptors([mobileAuthInterceptor])),
  provideApiConfiguration(environment.apiUrl),provideServiceWorker('ngsw-worker.js',{enabled:!isDevMode()})
]}).catch(error=>console.error(error));
