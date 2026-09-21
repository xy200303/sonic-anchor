import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      base: '#141311',
      surface: '#1C1B18',
      elevated: '#24221D',
      'border-subtle': '#34312A',
      'text-primary': '#EDEAE2',
      'text-secondary': '#A8A29A',
      brand: '#C4703F',
      'live-red': '#E23E32',
      success: '#6FA287',
      warning: '#D9A441',
      danger: '#E03131'
    }
  },
  shortcuts: {
    'panel-card': 'bg-surface border border-border-subtle rounded-[10px]'
  }
})
