<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Lock, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const isDevelopment = import.meta.env.DEV
const form = reactive({ username: 'admin', password: '' })

async function submit() {
  form.username = form.username.trim()
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    await router.replace('/dashboard')
  } catch {} finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-brand"><div class="brand-mark">播</div><div><strong>智能助播</strong><span>运营管理平台</span></div></div>
    <div class="login-card">
      <div class="login-heading"><h1>欢迎回来</h1><p>登录管理后台，查看直播运营数据</p></div>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="账号"><el-input v-model="form.username" size="large" :prefix-icon="User" placeholder="请输入管理账号" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" size="large" :prefix-icon="Lock" type="password" show-password placeholder="请输入登录密码" @keyup.enter="submit" /></el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login-button" @click="submit">登录管理后台</el-button>
      </el-form>
      <p class="login-tip">{{ isDevelopment ? '本地开发默认：admin / Admin@123456' : '请使用系统管理员分配的账号登录' }}</p>
    </div>
    <div class="login-footer">Sonic Anchor · Live Operations Console</div>
  </div>
</template>

<style scoped>
.login-page { display: flex; min-height: 100%; align-items: center; flex-direction: column; justify-content: center; padding: 32px 20px; background: linear-gradient(135deg, #f5f7fb 0%, #eef3ff 52%, #f7f8fa 100%); }
.login-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }.brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 9px; color: #fff; font-size: 17px; font-weight: 700; background: var(--sa-primary); box-shadow: 0 7px 18px rgba(43, 90, 237, .24); }.login-brand div:last-child { display: flex; flex-direction: column; }.login-brand strong { color: var(--sa-text-primary); font-size: 18px; letter-spacing: 1px; }.login-brand span { margin-top: 2px; color: var(--sa-text-secondary); font-size: 11px; }
.login-card { width: min(420px, 100%); padding: 34px 36px 27px; border: 1px solid var(--sa-border); border-radius: 8px; background: rgba(255, 255, 255, .96); box-shadow: 0 16px 42px rgba(31, 45, 61, .08); }.login-heading { margin-bottom: 24px; }.login-heading h1 { margin: 0; color: var(--sa-text-primary); font-size: 24px; font-weight: 600; }.login-heading p { margin: 8px 0 0; color: var(--sa-text-secondary); font-size: 13px; }.login-button { width: 100%; margin-top: 8px; }.login-tip { margin: 22px 0 0; color: var(--sa-text-secondary); font-size: 12px; text-align: center; }.login-footer { margin-top: 20px; color: #9aa5b5; font-size: 11px; letter-spacing: .4px; }
</style>
