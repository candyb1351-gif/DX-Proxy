########################
# Stage 1: build mtg (multi-secret fork)
########################
FROM golang:1.22-alpine AS build-mtg
ENV GOTOOLCHAIN=auto
RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/dolonet/mtg-multi.git /src
WORKDIR /src
# NOTE: verify build command against the fork's actual Makefile/README.
# If `go build .` fails, check /src for a cmd/ subfolder (e.g. `go build ./cmd/mtg-multi`).
RUN go build -o /mtg-multi . || go build -o /mtg-multi ./cmd/mtg-multi

########################
# Stage 2: build panel node_modules
########################
FROM node:20-alpine AS build-panel
WORKDIR /panel
COPY panel/package.json ./
RUN npm install --omit=dev
COPY panel/ ./

########################
# Stage 3: final runtime image
########################
FROM alpine:3.20

RUN apk add --no-cache bash jq curl nodejs tzdata ca-certificates

# mtg-multi binary
COPY --from=build-mtg /mtg-multi /usr/local/bin/mtg-multi

# panel app (with pre-installed node_modules)
COPY --from=build-panel /panel /opt/panel

# management CLI + shared lib
COPY dx /usr/local/bin/dx
COPY lib/ /opt/lib/
RUN chmod +x /usr/local/bin/dx

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Internal ports:
#  8080  -> MTProto (Railway TCP Proxy points here)
#  2053  -> HTTP panel (Railway HTTP Domain points here)
#  9090  -> mtg-multi internal stats API (loopback only, panel reads it)
ENV MT_PORT=8080
ENV PANEL_PORT=2053
ENV STATS_PORT=9090
ENV FAKE_TLS_DOMAIN=www.yahoo.com
ENV DATA_DIR=/data

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD (echo > /dev/tcp/127.0.0.1/${MT_PORT}) 2>/dev/null || exit 1

CMD ["/entrypoint.sh"]
