import { Radio, Mic, BarChart3, Settings } from 'lucide-vue-next'
import type { SideNavItem } from '@renderer/components/sidebar/types'

/**
 * 应用主导航配置。新增页面时在这里加一项即可，组件无需改动；
 * 分组项的 key 用 `group-` 前缀（仅作分组标识，不可选中跳转）。
 */
export const navMenus: SideNavItem[] = [
  {
    label: '直播',
    key: 'group-live',
    icon: Radio,
    children: [
      { label: '直播控制台', key: '/' },
      { label: '场次管理', key: '/plans' },
      { label: '话术脚本', key: '/script' },
      { label: '评论与回复', key: '/comments' }
    ]
  },
  {
    label: '内容与素材',
    key: 'group-content',
    icon: Mic,
    children: [
      { label: '音色库', key: '/voices' },
      { label: '商品知识库', key: '/products' }
    ]
  },
  { label: '数据中心', key: '/analytics', icon: BarChart3 },
  { label: '设置', key: '/settings', icon: Settings }
]
