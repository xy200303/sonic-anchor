<script setup lang="ts">
/**
 * 画面预览占位：直推（FFmpeg）与伴侣（输出窗口）模式都不提供应用内预览。
 * 直推画面以抖音端为准；伴侣模式直接看输出窗口或直播伴侣预览。
 */
</script>

<template>
  <div class="preview-box">
    <div class="hint">
      <p class="main">纯音频直播系统</p>
      <p class="sub">画面由直播伴侣或抖音侧提供 · 本系统负责 AI 声音与评论互动</p>
    </div>
  </div>
</template>

<style scoped>
.preview-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #000;
  border: 1px solid var(--border-subtle);
  min-height: 320px;
}
.hint {
  text-align: center;
}
.main {
  color: var(--text-tertiary);
  font-size: 13px;
  margin: 0 0 6px;
}
.sub {
  color: var(--text-tertiary);
  font-size: 11px;
  margin: 0;
  opacity: 0.7;
}
</style>
