FROM --platform=$BUILDPLATFORM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN apk add --no-cache git
WORKDIR /source
RUN git init \
    && git remote add origin https://github.com/pgsty/silo.git \
    && git fetch --depth 1 origin 3be10fcc1a44f6620ded0bd303461f9d688cca23 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "3be10fcc1a44f6620ded0bd303461f9d688cca23"
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download \
    && mkdir -p /out \
    && GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -p 2 -trimpath -ldflags "-s -w" -o /out/minio .

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
LABEL org.opencontainers.image.source="https://github.com/pgsty/silo" \
      org.opencontainers.image.revision="3be10fcc1a44f6620ded0bd303461f9d688cca23" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
RUN apk add --no-cache ca-certificates \
    && addgroup -S minio \
    && adduser -S -G minio minio \
    && mkdir -p /data \
    && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY deploy/public-demo/minio/LICENSE-silo-AGPL-3.0.txt /licenses/AGPL-3.0.txt
USER minio
EXPOSE 9000
ENTRYPOINT ["minio"]
