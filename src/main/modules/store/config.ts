import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_CONFIG, SECRET_KEYS, type AppConfig, type PartialDeep } from '@shared/ipc'
import { log } from '../../logger'

const CONFIG_PATH = join(app.getPath('userData'), 'config.json')

type StoredValue = string | { __enc: string }

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function encryptSecrets(config: AppConfig): Record<string, unknown> {
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(config))
  for (const key of SECRET_KEYS) {
    const value = getPath(clone, key)
    if (typeof value === 'string' && value.length > 0 && safeStorage.isEncryptionAvailable()) {
      const segments = key.split('.')
      const last = segments.pop()!
      let parent: Record<string, unknown> = clone
      for (const seg of segments) {
        parent = parent[seg] as Record<string, unknown>
      }
      parent[last] = { __enc: safeStorage.encryptString(value).toString('base64') }
    }
  }
  return clone
}

function decryptSecrets(raw: Record<string, unknown>): AppConfig {
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(raw))
  const walk = (obj: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '__enc' in (value as Record<string, unknown>)) {
        try {
          obj[key] = safeStorage.decryptString(
            Buffer.from((value as { __enc: string }).__enc, 'base64')
          )
        } catch (err) {
          log.warn('解密配置字段失败:', key, err)
          obj[key] = ''
        }
      } else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>)
      }
    }
  }
  walk(clone)
  return { ...structuredClone(DEFAULT_CONFIG), ...(clone as unknown as AppConfig) }
}

function mergeDeep<T>(target: T, patch: PartialDeep<T>): T {
  if (!patch || typeof patch !== 'object') return target
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      out[key] = mergeDeep(current, value as PartialDeep<typeof current>)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as T
}

export function loadConfig(): AppConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return structuredClone(DEFAULT_CONFIG)
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>
    return decryptSecrets(raw)
  } catch (err) {
    log.error('读取配置失败，回退默认配置:', err)
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(encryptSecrets(config), null, 2), 'utf-8')
  } catch (err) {
    log.error('写入配置失败:', err)
    throw err
  }
}

export function updateConfig(patch: PartialDeep<AppConfig>): AppConfig {
  const next = mergeDeep(loadConfig(), patch)
  saveConfig(next)
  return next
}
