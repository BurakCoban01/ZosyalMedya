FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /source
COPY package.json package-lock.json angular.json tsconfig.json ngsw-config.json .postcssrc.json ./
COPY apps ./apps
COPY packages ./packages
COPY contracts ./contracts
RUN --mount=type=cache,target=/root/.npm npm ci \
    && npm run api:generate \
    && npx ng build web-angular --configuration production --progress=false

FROM nginxinc/nginx-unprivileged:1.31.3-alpine3.24@sha256:f972e5322b9797dc2a6b830030094426437b1ae7032e4644496395336ac6fdac
COPY apps/web-angular/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /source/dist/web-angular/browser /usr/share/nginx/html
ENV API_UPSTREAM=api:8080
EXPOSE 8080
