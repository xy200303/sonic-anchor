import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    {
      path: '/', component: () => import('@/layout/AdminLayout.vue'), redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '数据总览', group: '工作台' } },
        { path: 'douyin-apps', component: () => import('@/views/DouyinAppsView.vue'), meta: { title: '抖音应用', group: '直播运营' } },
        { path: 'live-sessions', component: () => import('@/views/LiveSessionsView.vue'), meta: { title: '直播场次', group: '直播运营' } },
        { path: 'users', component: () => import('@/views/UsersView.vue'), meta: { title: '系统用户', group: '系统管理' } }
      ]
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.path === '/login') return auth.token ? '/dashboard' : true
  if (!auth.token) return `/login?redirect=${encodeURIComponent(to.fullPath)}`
  if (!auth.user) {
    try { await auth.loadUser() } catch { auth.logout(); return '/login' }
  }
  return true
})

export default router
