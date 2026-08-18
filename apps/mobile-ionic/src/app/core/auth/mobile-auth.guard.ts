import { inject } from '@angular/core';import { CanActivateFn,Router } from '@angular/router';import { MobileSession } from './secure-token-storage';
export const mobileAuthGuard:CanActivateFn=()=>inject(MobileSession).authenticated()?true:inject(Router).createUrlTree(['/giris']);
