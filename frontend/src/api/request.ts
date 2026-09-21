import axios from 'axios'
import { ElMessage } from 'element-plus'

interface ApiResult<T> { code: number; message: string; data: T }

const service = axios.create({ baseURL: '/api/admin', timeout: 30000 })

service.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

service.interceptors.response.use(
  (response) => {
    const result = response.data as ApiResult<unknown>
    if (result.code === 0) {
      response.data = result.data
      return response
    }
    ElMessage.error(result.message || '请求失败')
    return Promise.reject(new Error(result.message))
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      const message = error.response?.data?.message || '用户名或密码错误'
      ElMessage.error(message)
      if (!location.pathname.includes('/login')) location.href = '/login'
    } else if (!error.response) {
      ElMessage.error('无法连接后台服务，请先启动 Docker Compose（后端端口 8090）')
    } else {
      ElMessage.error(error.response?.data?.message || '网络异常')
    }
    return Promise.reject(error)
  }
)

export async function request<T>(config: Parameters<typeof service.request>[0]): Promise<T> {
  const response = await service.request<T>(config)
  return response.data
}
