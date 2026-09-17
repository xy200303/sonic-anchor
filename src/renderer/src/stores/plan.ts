import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AppConfig, LivePlan, PartialDeep } from '@shared/ipc'
import { useConfigStore } from './config'

/**
 * 直播场次：一场直播的完整配置方案集合。
 * 切换场次时把 BGM / 音色 / 自动回复写回全局配置并生效，
 * 绑定的话术只存到 activeScriptId（播报控制条读取，不回写场次）。
 */
export const usePlanStore = defineStore('plan', () => {
  const plans = ref<LivePlan[]>([])
  /** 当前场次 id（持久化在 config.live.activePlanId） */
  const activeId = ref('')
  /** 当前场次绑定的话术，供播报控制条使用；手动改选只影响本次播报 */
  const activeScriptId = ref('')

  const active = computed(() => plans.value.find((p) => p.id === activeId.value) ?? null)

  async function load(): Promise<void> {
    const configStore = useConfigStore()
    // activePlanId 存在配置里，先确保配置已加载（重复调用安全）
    if (!configStore.loaded) await configStore.load()
    plans.value = await window.api.plan.list()
    activeId.value = configStore.config.live.activePlanId
    activeScriptId.value = active.value?.scriptId ?? ''
  }

  async function savePlan(p: LivePlan): Promise<void> {
    await window.api.plan.save(p)
    plans.value = await window.api.plan.list()
  }

  async function removePlan(id: string): Promise<void> {
    await window.api.plan.remove(id)
    if (activeId.value === id) {
      activeId.value = ''
      activeScriptId.value = ''
      await useConfigStore().save({ live: { activePlanId: '' } })
    }
    plans.value = await window.api.plan.list()
  }

  /** 切换当前场次并应用其配置（BGM / 音色 / 自动回复 / 默认话术） */
  async function setActive(id: string): Promise<void> {
    const configStore = useConfigStore()
    const plan = plans.value.find((p) => p.id === id)
    activeId.value = id
    const patch: PartialDeep<AppConfig> = { live: { activePlanId: id } }
    if (plan) {
      patch.bgm = { path: plan.bgmPath, volume: plan.bgmVolume }
      // config.tts.voiceId 存的是火山 voice_type，需从 voices 表主键映射
      if (plan.voiceId) {
        const voices = await window.api.voice.list()
        const voice = voices.find((v) => v.id === plan.voiceId)
        if (voice) patch.tts = { voiceId: voice.voiceType }
      }
    }
    await configStore.save(patch)
    if (plan) {
      await window.api.reply.setAuto(plan.autoReply)
      activeScriptId.value = plan.scriptId ?? ''
    }
  }

  return { plans, activeId, activeScriptId, active, load, savePlan, removePlan, setActive }
})
