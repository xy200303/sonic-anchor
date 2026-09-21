<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useAppStore } from '@/stores/app'
import AppNavbar from './components/AppNavbar.vue'
import AppSidebar from './components/AppSidebar.vue'
import TagsView from './components/TagsView.vue'

const app = useAppStore()
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="layout-wrapper" :class="{ collapsed: app.sidebarCollapsed }">
      <AppSidebar />
      <section class="main-area">
        <AppNavbar />
        <TagsView />
        <main class="app-main" tabindex="-1">
          <router-view v-slot="{ Component }">
            <transition name="page-fade" mode="out-in"><component :is="Component" /></transition>
          </router-view>
        </main>
      </section>
    </div>
  </el-config-provider>
</template>

<style scoped>
.layout-wrapper { display: flex; min-width: 0; height: 100%; background: var(--sa-bg-page); }
.main-area { display: flex; flex: 1; min-width: 0; flex-direction: column; }
.app-main { flex: 1; min-width: 0; overflow: auto; }
.page-fade-enter-active, .page-fade-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(4px); }
.page-fade-leave-to { opacity: 0; }
</style>
