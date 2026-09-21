<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Expand, Fold, FullScreen, Refresh, SwitchButton } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()
const breadcrumbs = computed(() => [String(route.meta.group ?? ''), String(route.meta.title ?? '')].filter(Boolean))
const avatarText = computed(() => auth.user?.name?.slice(0, 1) || auth.user?.username?.slice(0, 1) || '管')
const roleLabel = computed(() => auth.user?.role === 'super_admin' ? '超级管理员' : auth.user?.role || '管理员')

function refreshPage() { router.go(0) }
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}
async function logout() {
  const confirmed = await ElMessageBox.confirm('确定退出当前管理账号吗？', '退出登录', {
    confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning'
  }).then(() => true).catch(() => false)
  if (!confirmed) return
  auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <header class="navbar">
    <div class="navbar-left">
      <button class="icon-action" type="button" :aria-label="app.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" @click="app.toggleSidebar">
        <el-icon :size="18"><Expand v-if="app.sidebarCollapsed" /><Fold v-else /></el-icon>
      </button>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item>智能助播</el-breadcrumb-item>
        <el-breadcrumb-item v-for="item in breadcrumbs" :key="item">{{ item }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <div class="navbar-right">
      <el-tooltip content="刷新当前页" placement="bottom">
        <button class="icon-action" type="button" aria-label="刷新当前页" @click="refreshPage"><el-icon :size="18"><Refresh /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="全屏" placement="bottom">
        <button class="icon-action" type="button" aria-label="切换全屏" @click="toggleFullscreen"><el-icon :size="18"><FullScreen /></el-icon></button>
      </el-tooltip>
      <span class="navbar-divider" />
      <el-dropdown trigger="click" @command="logout">
        <button class="user-entry" type="button">
          <el-avatar :size="30" class="user-avatar">{{ avatarText }}</el-avatar>
          <span class="user-copy"><strong>{{ auth.user?.name || auth.user?.username }}</strong><small>{{ roleLabel }}</small></span>
          <el-icon :size="13"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu><el-dropdown-item command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped>
.navbar {
  display: flex;
  height: var(--sa-navbar-height);
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--sa-border);
  background: var(--sa-bg-card);
}
.navbar-left, .navbar-right { display: flex; align-items: center; }
.navbar-left { gap: 16px; }
.navbar-right { gap: 6px; }
.icon-action {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--sa-text-regular);
  background: transparent;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}
.icon-action:hover, .icon-action:focus-visible { color: var(--sa-primary); background: var(--sa-primary-light); }
.navbar-divider { width: 1px; height: 22px; margin: 0 8px; background: var(--sa-border); }
.user-entry {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  color: var(--sa-text-primary);
  background: transparent;
  cursor: pointer;
}
.user-entry:hover, .user-entry:focus-visible { background: var(--sa-bg-page); }
.user-avatar { color: #fff; font-size: 13px; background: var(--sa-primary); }
.user-copy { display: flex; align-items: flex-start; flex-direction: column; line-height: 1.25; }
.user-copy strong { font-size: 13px; font-weight: 600; }
.user-copy small { margin-top: 2px; color: var(--sa-text-secondary); font-size: 11px; }
</style>
