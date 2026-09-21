<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useAudioStore } from '@renderer/stores/audio'
import { useLiveStore } from '@renderer/stores/live'

/**
 * 音频可视化面板（原画面预览位）：电平驱动的频谱柱 + 当前播报信息。
 * 纯音频系统的控制台核心视觉——直播时这里应该是"活"的。
 */

const BAR_COUNT = 40

const audio = useAudioStore()
const live = useLiveStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

let rafId = 0
let smooth = 0

function draw(): void {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (canvas && ctx) {
    const W = (canvas.width = canvas.clientWidth * devicePixelRatio)
    const H = (canvas.height = canvas.clientHeight * devicePixelRatio)
    ctx.clearRect(0, 0, W, H)

    // 平滑跟随电平，空闲时衰减到底座
    const target = Math.max(audio.levels.master, 0.04)
    smooth += (target - smooth) * 0.15

    const t = performance.now() / 1000
    const barW = W / BAR_COUNT
    const active = live.state === 'live'

    for (let i = 0; i < BAR_COUNT; i++) {
      const wave = 0.55 + 0.45 * Math.sin(t * 3 + i * 0.6) * Math.sin(t * 1.7 + i * 0.3)
      const h = Math.max(H * 0.03, H * smooth * wave)
      const x = i * barW + barW * 0.2
      const w = barW * 0.6
      ctx.fillStyle = active ? '#C4703F' : '#3B372E'
      ctx.beginPath()
      ctx.roundRect(x, (H - h) / 2, w, h, w / 2)
      ctx.fill()
    }
  }
  rafId = requestAnimationFrame(draw)
}

onMounted(() => {
  rafId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => cancelAnimationFrame(rafId))
</script>

<template>
  <div class="viz-box">
    <canvas ref="canvasRef" class="viz-canvas" />
    <div class="overlay">
      <p v-if="audio.nowPlaying" class="playing">{{ audio.nowPlaying.label }}</p>
      <p v-else class="idle">纯音频直播系统 · 等待播报</p>
    </div>
  </div>
</template>

<style scoped>
.viz-box {
  flex: 1;
  position: relative;
  border-radius: 8px;
  background: #0d0c0b;
  border: 1px solid var(--border-subtle);
  min-height: 240px;
  overflow: hidden;
}
.viz-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  text-align: center;
  pointer-events: none;
}
.playing {
  margin: 0;
  color: var(--brand);
  font-size: 13px;
  font-weight: 500;
}
.idle {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
