<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import type { MenuOption } from 'naive-ui'
import { NMenu } from 'naive-ui'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import type { SideNavItem } from './types'

/**
 * 通用侧边导航组件。
 * 只负责：菜单渲染、分组折叠、收起/展开交互与偏好持久化。
 * 不负责：菜单数据从哪来、选中后跳到哪（由使用方通过 props / select 事件决定）。
 *
 * 复用方式：
 *   <SideNav :menus="menus" :active-key="current" @select="go" />
 *   品牌区与底部可通过 #brand、#footer 插槽覆盖。
 */
const props = withDefaults(
  defineProps<{
    menus: SideNavItem[]
    activeKey?: string
    brandMark?: string
    brandName?: string
    width?: number
    collapsedWidth?: number
    /** localStorage 键名，多实例复用时各自隔离 */
    storageKey?: string
  }>(),
  {
    activeKey: '',
    brandMark: '',
    brandName: '',
    width: 208,
    collapsedWidth: 64,
    storageKey: 'sidebar-collapsed'
  }
)

const emit = defineEmits<{
  select: [key: string]
}>()

const collapsed = ref(false)

onMounted(() => {
  collapsed.value = localStorage.getItem(props.storageKey) === '1'
})

watch(collapsed, (value) => {
  localStorage.setItem(props.storageKey, value ? '1' : '0')
})

function toggle(): void {
  collapsed.value = !collapsed.value
}

function toOptions(items: SideNavItem[]): MenuOption[] {
  return items.map((item) => ({
    label: item.label,
    key: item.key,
    icon: item.icon ? () => h(item.icon!) : undefined,
    children: item.children?.length ? toOptions(item.children) : undefined
  }))
}

const menuOptions = computed(() => toOptions(props.menus))

function onSelect(key: string): void {
  emit('select', key)
}
</script>

<template>
  <nav
    class="side-nav"
    :class="{ collapsed }"
    :style="{ width: collapsed ? `${collapsedWidth}px` : `${width}px` }"
  >
    <div class="brand-row">
      <button
        v-if="collapsed"
        class="brand-mark as-toggle"
        :aria-label="'展开侧边栏'"
        @click="toggle"
      >
        <PanelLeftOpen :size="16" :stroke-width="2" />
      </button>
      <slot v-else name="brand">
        <div class="brand">
          <span v-if="brandMark" class="brand-mark">{{ brandMark }}</span>
          <span v-if="brandName" class="brand-name">{{ brandName }}</span>
        </div>
      </slot>
      <button v-if="!collapsed" class="toggle" aria-label="收起侧边栏" @click="toggle">
        <PanelLeftClose :size="16" :stroke-width="2" />
      </button>
    </div>

    <div class="menu-wrap">
      <NMenu
        :value="activeKey || undefined"
        :options="menuOptions"
        :collapsed="collapsed"
        :collapsed-width="collapsedWidth"
        :collapsed-icon-size="18"
        accordion
        @update:value="onSelect"
      />
    </div>

    <div v-if="$slots.footer" class="footer">
      <slot name="footer" :collapsed="collapsed" />
    </div>
  </nav>
</template>

<style scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 8px 8px;
  box-sizing: border-box;
  border-right: 1px solid var(--border-subtle);
  transition: width 200ms ease-out;
  flex-shrink: 0;
}
.side-nav.collapsed {
  padding: 14px 0 8px;
}
.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 14px;
  flex-shrink: 0;
}
.side-nav.collapsed .brand-row {
  padding: 0 0 14px;
  justify-content: center;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.brand-mark.as-toggle {
  background: transparent;
  color: var(--text-tertiary);
  border: none;
  cursor: pointer;
  transition:
    background 150ms ease-out,
    color 150ms ease-out;
}
.brand-mark.as-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.brand-name {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
}
.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    background 150ms ease-out,
    color 150ms ease-out;
}
.toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.menu-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.footer {
  flex-shrink: 0;
  padding-top: 8px;
}
</style>
