FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:9.0@sha256:35048e3a81e6a07c316e7bbbd80d80d2ba705fe5f23a8ed42b6638c8f4c20d30 AS build
WORKDIR /source
COPY . .
RUN --mount=type=cache,target=/root/.nuget/packages dotnet restore src/Host/Api/ZosyalMedya.Host.Api.csproj \
    && dotnet publish src/Host/Api/ZosyalMedya.Host.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine@sha256:b288317d8ed45bb763fa95dbc807cf9d36e3bf9373ec2fac6b6548675f1f4b23 AS final
WORKDIR /app
RUN addgroup -S platform && adduser -S platform -G platform \
    && mkdir -p /app/data/media /app/.local/data-protection-keys \
        /var/lib/enterprise-social-community-platform \
    && chown -R platform:platform /app /var/lib/enterprise-social-community-platform
COPY --from=build --chown=platform:platform /app .
USER platform
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet","ZosyalMedya.Host.Api.dll"]
