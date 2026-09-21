ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG GOPROXY=https://goproxy.cn,direct

FROM golang:1.26-alpine AS backend-dev
ARG GOPROXY
ENV GOPROXY=$GOPROXY
WORKDIR /app
RUN go install github.com/air-verse/air@v1.61.4
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
CMD ["air", "-build.cmd", "go build -o ./tmp/server ./cmd/server", "-build.bin", "./tmp/server", "-build.include_ext", "go,sql", "-build.exclude_dir", "tmp", "-build.delay", "300"]

FROM node:22-alpine AS frontend-dev
ARG NPM_REGISTRY
RUN npm config set registry $NPM_REGISTRY
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS frontend-build
ARG NPM_REGISTRY
RUN npm config set registry $NPM_REGISTRY
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-alpine AS backend-build
ARG GOPROXY
ENV GOPROXY=$GOPROXY
WORKDIR /backend
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/server ./cmd/server

FROM alpine:3.21 AS prod
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 appuser
ENV TZ=Asia/Shanghai
WORKDIR /app
COPY --from=backend-build /out/server /app/server
COPY --from=frontend-build /frontend/dist /app/admin
USER appuser
EXPOSE 8090
CMD ["/app/server"]
