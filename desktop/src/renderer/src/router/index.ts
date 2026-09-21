import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@renderer/layout/MainLayout.vue'),
      children: [
        { path: '', name: 'control', component: () => import('@renderer/views/ControlCenterView.vue'), meta: { title: '直播控制台' } },
        { path: 'plans', name: 'plans', component: () => import('@renderer/views/PlansView.vue'), meta: { title: '场次管理' } },
        { path: 'script', name: 'script', component: () => import('@renderer/views/ScriptView.vue'), meta: { title: '话术脚本' } },
        { path: 'comments', name: 'comments', component: () => import('@renderer/views/CommentsView.vue'), meta: { title: '评论与回复' } },
        { path: 'voices', name: 'voices', component: () => import('@renderer/views/VoicesView.vue'), meta: { title: '音色库' } },
        { path: 'products', name: 'products', component: () => import('@renderer/views/ProductsView.vue'), meta: { title: '商品知识库' } },
        { path: 'analytics', name: 'analytics', component: () => import('@renderer/views/AnalyticsView.vue'), meta: { title: '数据中心' } },
        { path: 'settings', name: 'settings', component: () => import('@renderer/views/SettingsView.vue'), meta: { title: '设置' } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
