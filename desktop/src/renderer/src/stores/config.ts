import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_CONFIG, type AppConfig, type PartialDeep } from '@shared/ipc'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(structuredClone(DEFAULT_CONFIG))
  const loaded = ref(false)

  async function load(): Promise<void> {
    config.value = await window.api.config.get()
    loaded.value = true
  }

  async function save(patch: PartialDeep<AppConfig>): Promise<void> {
    config.value = await window.api.config.set(patch)
  }

  return { config, loaded, load, save }
})
