import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { MobileSession } from './secure-token-storage';

export const mobileAuthInterceptor:HttpInterceptorFn=(request,next)=>{const session=inject(MobileSession);return from(session.validAccessToken()).pipe(switchMap(token=>{const authorized=token?request.clone({setHeaders:{Authorization:`Bearer ${token}`}}):request;return next(authorized);}),catchError((error:HttpErrorResponse)=>{if(error.status!==401||request.url.includes('/identity/refresh'))return throwError(()=>error);return from(session.rotate()).pipe(switchMap(rotated=>rotated?next(request.clone({setHeaders:{Authorization:`Bearer ${rotated}`}})):throwError(()=>error)));}));};
