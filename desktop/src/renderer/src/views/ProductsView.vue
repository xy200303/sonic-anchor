<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import type { Product } from '@shared/ipc'

const message = useMessage()
const dialog = useDialog()

const products = ref<Product[]>([])
const editing = ref<Product | null>(null)

const form = ref({ id: '', name: '', price: 0, sellingPoints: '', faq: '' })

async function refresh(): Promise<void> {
  products.value = await window.api.db.listProducts()
}

onMounted(refresh)

function openNew(): void {
  form.value = { id: '', name: '', price: 0, sellingPoints: '', faq: '' }
  editing.value = {} as Product
}

function openEdit(p: Product): void {
  form.value = {
    id: p.id,
    name: p.name,
    price: p.price,
    sellingPoints: p.sellingPoints,
    faq: p.faq
  }
  editing.value = p
}

async function save(): Promise<void> {
  if (!form.value.name.trim()) {
    message.warning('请填写商品名称')
    return
  }
  await window.api.db.saveProduct({
    id: form.value.id || `p-${Date.now()}`,
    name: form.value.name.trim(),
    price: form.value.price,
    sellingPoints: form.value.sellingPoints,
    faq: form.value.faq,
    createdAt: editing.value?.id ? (editing.value.createdAt ?? Date.now()) : Date.now()
  })
  editing.value = null
  message.success('商品已保存')
  await refresh()
}

function remove(p: Product): void {
  dialog.warning({
    title: '删除商品',
    content: `确定删除「${p.name}」吗？话术与回复将失去该商品的知识来源。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await window.api.db.deleteProduct(p.id)
      await refresh()
    }
  })
}
</script>

<template>
  <div class="products">
    <div class="head">
      <h1 class="title">商品知识库</h1>
      <n-button type="primary" @click="openNew">新增商品</n-button>
    </div>

    <p class="note">价格与 FAQ 会被 AI 强制引用回答观众提问，请确保信息准确。</p>

    <div v-if="products.length === 0" class="empty">还没有商品，点右上角「新增商品」录入</div>

    <div v-else class="cards">
      <div v-for="p in products" :key="p.id" class="panel-card card">
        <div class="card-head">
          <span class="name">{{ p.name }}</span>
          <span class="price mono-nums">¥{{ p.price }}</span>
        </div>
        <p class="field"><span class="fl">卖点</span>{{ p.sellingPoints || '—' }}</p>
        <p class="field"><span class="fl">FAQ</span>{{ p.faq || '—' }}</p>
        <div class="ops">
          <n-button size="small" @click="openEdit(p)">编辑</n-button>
          <n-button size="small" type="error" ghost @click="remove(p)">删除</n-button>
        </div>
      </div>
    </div>

    <n-modal
      :show="!!editing"
      preset="card"
      :title="form.id ? '编辑商品' : '新增商品'"
      style="width: 560px"
      @update:show="editing = null"
    >
      <n-form label-placement="top">
        <n-form-item label="商品名称" required>
          <n-input v-model:value="form.name" placeholder="如：手工藤编收纳篮" />
        </n-form-item>
        <n-form-item label="价格（元）">
          <n-input-number v-model:value="form.price" :min="0" :precision="2" style="width: 180px" />
        </n-form-item>
        <n-form-item label="核心卖点（多行换行分隔）">
          <n-input v-model:value="form.sellingPoints" type="textarea" :rows="3" />
        </n-form-item>
        <n-form-item label="常见问题 FAQ（AI 回复的事实依据）">
          <n-input
            v-model:value="form.faq"
            type="textarea"
            :rows="4"
            placeholder="如：发货时间：48小时内；售后：支持七天无理由；材质：天然藤条"
          />
        </n-form-item>
      </n-form>
      <div class="modal-actions">
        <n-button quaternary @click="editing = null">取消</n-button>
        <n-button type="primary" @click="save">保存</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.products {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
.empty {
  color: var(--text-tertiary);
  padding: 32px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.card {
  padding: 14px 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.name {
  font-weight: 600;
}
.price {
  color: var(--brand);
  font-weight: 600;
}
.field {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
}
.fl {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.ops {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
