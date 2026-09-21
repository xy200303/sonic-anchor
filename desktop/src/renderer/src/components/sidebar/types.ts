import type { Component } from 'vue'

/** 侧边栏菜单项。key 为路由路径或以 `group-` 开头的前缀 key（仅用于分组，不可选中） */
export interface SideNavItem {
  key: string
  label: string
  icon?: Component
  children?: SideNavItem[]
}
