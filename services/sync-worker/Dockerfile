# Multi-stage Go sync-worker — small static binary, no Python.
FROM golang:1.23-alpine AS build
WORKDIR /src
RUN apk add --no-cache ca-certificates tzdata git
COPY go.mod ./
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/sync-worker ./cmd/sync-worker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
  && adduser -D -H -u 10001 forge
WORKDIR /app
COPY --from=build /out/sync-worker /app/sync-worker
USER forge
ENTRYPOINT ["/app/sync-worker"]
