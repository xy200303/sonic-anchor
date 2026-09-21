<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { DataAnalysis, Monitor, Setting, User, VideoCamera } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const app = useAppStore()
const activeMenu = computed(() => route.path)
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">播</div>
      <div v-show="!app.sidebarCollapsed" class="brand-copy">
        <strong>智能助播</strong>
        <span>运营管理平台</span>
      </div>
    </div>

    <el-scrollbar class="menu-scroll">
      <el-menu
        class="sidebar-menu"
        :collapse="app.sidebarCollapsed"
        :collapse-transition="false"
        :default-active="activeMenu"
        :unique-opened="true"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>数据总览</template>
        </el-menu-item>
        <el-sub-menu index="live-operation">
          <template #title>
            <el-icon><VideoCamera /></el-icon>
            <span>直播运营</span>
          </template>
          <el-menu-item index="/douyin-apps">
            <el-icon><Setting /></el-icon>
            <template #title>抖音应用</template>
          </el-menu-item>
          <el-menu-item index="/live-sessions">
            <el-icon><Monitor /></el-icon>
            <template #title>直播场次</template>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="system-management">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统管理</span>
          </template>
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <template #title>系统用户</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-scrollbar>

    <div class="sidebar-foot" :class="{ compact: app.sidebarCollapsed }">
      <span class="status-dot" />
      <span v-show="!app.sidebarCollapsed">服务运行正常</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  width: var(--sa-sidebar-width);
  flex: 0 0 var(--sa-sidebar-width);
  flex-direction: column;
  overflow: hidden;
  background: var(--sa-sidebar-bg);
  transition: width 200ms ease, flex-basis 200ms ease;
}
.collapsed .sidebar { width: var(--sa-sidebar-collapsed); flex-basis: var(--sa-sidebar-collapsed); }
.brand {
  display: flex;
  height: var(--sa-navbar-height);
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  background: var(--sa-primary);
  box-shadow: 0 6px 16px rgba(43, 90, 237, 0.28);
}
.brand-copy { display: flex; min-width: 0; flex-direction: column; white-space: nowrap; }
.brand-copy strong { color: #f7f9fc; font-size: 16px; letter-spacing: 1px; }
.brand-copy span { margin-top: 1px; color: #8291a7; font-size: 11px; }
.menu-scroll { flex: 1; }
.sidebar-menu { padding: 10px 8px; }
.sidebar-foot {
  display: flex;
  height: 46px;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  margin: 0 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #8291a7;
  font-size: 12px;
  white-space: nowrap;
}
.sidebar-foot.compact { justify-content: center; margin: 0 8px; }
.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--sa-success);
  box-shadow: 0 0 0 3px rgba(43, 164, 113, 0.16);
}
</style>
