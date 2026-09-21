import { defineStore } from 'pinia'
import { ref } from 'vue'

interface ViewTag {
  path: string
  title: string
  affix?: boolean
}

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(localStorage.getItem('admin_sidebar_collapsed') === '1')
  const tags = ref<ViewTag[]>([{ path: '/dashboard', title: '数据总览', affix: true }])

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem('admin_sidebar_collapsed', sidebarCollapsed.value ? '1' : '0')
  }

  function addTag(path: string, title: string) {
    if (!path || path === '/login' || tags.value.some((tag) => tag.path === path)) return
    tags.value.push({ path, title })
  }

  function closeTag(path: string): string {
    const index = tags.value.findIndex((tag) => tag.path === path)
    if (index < 0 || tags.value[index].affix) return '/dashboard'
    tags.value.splice(index, 1)
    return tags.value[Math.min(index, tags.value.length - 1)]?.path ?? '/dashboard'
  }

  function closeOthers(path: string) {
    tags.value = tags.value.filter((tag) => tag.affix || tag.path === path)
  }

  return { sidebarCollapsed, tags, toggleSidebar, addTag, closeTag, closeOthers }
})
