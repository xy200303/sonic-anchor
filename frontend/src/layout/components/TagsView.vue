<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
watch(() => route.path, () => app.addTag(route.path, String(route.meta.title ?? '未命名页面')), { immediate: true })
function closeTag(path: string) {
  const nextPath = app.closeTag(path)
  if (route.path === path) void router.push(nextPath)
}
function closeOthers(path: string) {
  app.closeOthers(path)
  if (route.path !== path) void router.push(path)
}
</script>

<template>
  <div class="tags-view">
    <el-scrollbar>
      <div class="tags-list">
        <router-link v-for="tag in app.tags" :key="tag.path" :to="tag.path" class="tag-item" :class="{ active: route.path === tag.path }" @contextmenu.prevent="closeOthers(tag.path)">
          <span class="tag-dot" /><span>{{ tag.title }}</span>
          <el-icon v-if="!tag.affix" class="tag-close" :size="12" @click.prevent.stop="closeTag(tag.path)"><Close /></el-icon>
        </router-link>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.tags-view { height: var(--sa-tags-height); flex-shrink: 0; padding: 0 16px; border-bottom: 1px solid var(--sa-border); background: var(--sa-bg-card); }
.tags-list { display: flex; height: var(--sa-tags-height); align-items: center; gap: 8px; }
.tag-item {
  display: inline-flex;
  height: 26px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--sa-border);
  border-radius: 4px;
  color: var(--sa-text-regular);
  font-size: 12px;
  white-space: nowrap;
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.tag-item:hover { color: var(--sa-primary); border-color: #9db4f7; }
.tag-item.active { color: var(--sa-primary); border-color: var(--sa-primary); background: var(--sa-primary-light); }
.tag-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sa-border-dark); }
.tag-item.active .tag-dot { background: var(--sa-primary); }
.tag-close { border-radius: 50%; }
.tag-close:hover { color: #fff; background: var(--sa-text-secondary); }
</style>
