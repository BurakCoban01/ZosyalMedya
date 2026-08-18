import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenVault } from './token-vault.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.url.includes('/identity/browser/')) return next(request);
  const vault = inject(TokenVault);
  return from(vault.validAccessToken()).pipe(switchMap(token => {
    const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
    return next(authorized);
  }),catchError(error => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401 || request.url.includes('/identity/browser/'))
      return throwError(() => error);
    return from(vault.rotate()).pipe(switchMap(rotated => rotated
      ? next(request.clone({ setHeaders: { Authorization: `Bearer ${rotated}` } }))
      : throwError(() => error)));
  }));
};
