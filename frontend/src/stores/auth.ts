import { defineStore } from 'pinia'
import { ref } from 'vue'
import { request } from '@/api/request'

export interface AdminUser { id: string; username: string; name: string; role: string }

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('admin_token') ?? '')
  const user = ref<AdminUser | null>(null)

  async function login(username: string, password: string) {
    const result = await request<{ access_token: string; user: AdminUser }>({ method: 'POST', url: '/auth/login', data: { username, password } })
    token.value = result.access_token
    user.value = result.user
    localStorage.setItem('admin_token', result.access_token)
  }

  async function loadUser() {
    if (!token.value) return
    user.value = await request<AdminUser>({ url: '/auth/me' })
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('admin_token')
  }

  return { token, user, login, loadUser, logout }
})
