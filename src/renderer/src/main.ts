import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import 'virtual:uno.css'
import './styles/tokens.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).use(naive).mount('#app')
