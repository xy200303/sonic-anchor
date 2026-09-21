# 智能助播平台

项目由桌面直播客户端、Web 管理后台和服务端组成。

## 目录

- `desktop/`：Electron 桌面端，负责直播控制、音频混音、FFmpeg 和本地交互。
- `frontend/`：Vue 3 管理后台，负责抖音应用、直播场次和系统配置。
- `backend/`：Go 服务端，负责抖音 OpenAPI、HTTP 回调、WebSocket、鉴权和数据存储。

## 桌面端开发

```bash
npm --prefix desktop install
bun run dev
```

## 服务端开发

复制 `.env.example` 为 `.env.dev`，修改密码和密钥后运行：

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml up --build
```

管理后台地址：`http://localhost:5180`

后端健康检查：`http://localhost:8090/healthz`

## 生产部署

复制 `.env.example` 为 `.env.prod`，至少设置以下配置：

- `APP_DOMAIN`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `DATA_ENCRYPTION_KEY`
- `DESKTOP_SHARED_KEY`
- `ADMIN_PASSWORD`
- `PUBLIC_BASE_URL`

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

`DATA_ENCRYPTION_KEY` 必须是 Base64 编码的 32 字节随机密钥。抖音 `AppSecret` 和推送签名密钥只保存在服务端。
