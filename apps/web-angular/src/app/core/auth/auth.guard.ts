import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenVault } from './token-vault.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const vault = inject(TokenVault);
  const router = inject(Router);
  return await vault.validAccessToken()
    ? true
    : router.createUrlTree(['/giris'], { queryParams: { returnUrl: state.url } });
};
