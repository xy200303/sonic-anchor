# Sonic Anchor · AI 直播助手

纯音频 AI 直播助手：AI 话术播报 + 评论自动语音回复 + 真人随时接管。
画面交给直播伴侣 / 抖音侧，本系统只负责「说话」和「回评论」。

## 核心能力

- **AI 话术播报**：LLM（豆包 / DeepSeek / 通义）按商品资料生成结构化话术，TTS（火山引擎，支持克隆音色）合成后循环播报
- **评论自动回复**：抖音开放平台评论长连接 → 意图分类（问价/提问/闲聊/无效）→ LLM 结合商品知识库生成回复（价格强制查库，防编造）→ 语音插播
- **人工优先**：每条 AI 回复可跳过/改稿/置顶；按住接管说话、插话、紧急停止一键可达
- **说话自动避让**：检测到真人说话时自动暂停 AI 播报，停嘴恢复
- **BGM + Ducking**：AI 说话时背景音乐自动压低
- **两种推流模式**：FFmpeg 纯音频直推（静态帧 + AI 混音 → RTMP）/ 直播伴侣模式（系统声音采集）
- **场次复盘**：评论意图分布、互动趋势、高频问题 TOP10、回复记录 CSV 导出

## 技术栈

Electron + Vue 3 + TypeScript + electron-vite

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 33（contextIsolation + sandbox） |
| UI | Vue 3 / Pinia / Naive UI / UnoCSS / ECharts |
| 推流 | FFmpeg（ffmpeg-static 内嵌，纯音频 RTMP） |
| 音频 | WebAudio 混音总线（TTS / BGM / 麦克风，ducking） |
| LLM | OpenAI 兼容协议（火山 ark / DeepSeek / 通义） |
| TTS | 火山引擎大模型语音合成（HTTP，句级并行） |
| 存储 | SQLite（better-sqlite3，WAL）+ safeStorage 凭证加密 |

## 开发

```bash
npm install
npm run rebuild   # 原生模块对齐 Electron ABI（每次 install 后执行）
npm run dev
```

```bash
npm run typecheck # TS 严格模式检查
npm run build     # 构建产物
npm run dist      # 打包 Windows 安装包（NSIS）
```

## 配置

首次使用在「设置」中配置：推流（推流码或伴侣模式）、LLM API Key、火山 TTS（AppId / Access Token）、评论监控（开放平台凭据或开发模拟器）。

## 设计文档

`docs/` 目录下有完整的技术方案、TTS 选型调研、UI/UX 方案与用户交互流程。
