<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  PlusOutlined,
  DeleteOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  GRADE_OPTIONS,
  SEMESTER_OPTIONS,
  getWorkspaceDisplayName,
  type GradeValue,
  type SemesterValue,
} from '@/utils/exportName'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const creating = ref(false)
const createModalOpen = ref(false)
const selectedGrade = ref<GradeValue>('1')
const selectedSemester = ref<SemesterValue>('上册')

function openCreateModal() {
  selectedGrade.value = '1'
  selectedSemester.value = '上册'
  createModalOpen.value = true
}

async function handleCreate() {
  creating.value = true
  try {
    const ws = await workspaceStore.create({
      grade: selectedGrade.value,
      semester: selectedSemester.value,
    })
    createModalOpen.value = false
    await router.push(`/workspace/${ws.id}/import`)
  } finally {
    creating.value = false
  }
}

function openWorkspace(id: string, stage: string) {
  workspaceStore.select(id)
  const step = stage === 'expanded' || stage === 'merged' ? 'export' : 'import'
  router.push(`/workspace/${id}/${step}`)
}

async function handleDelete(id: string) {
  await workspaceStore.remove(id)
  message.success('已删除')
}
</script>

<template>
  <div class="page-container">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px">
      <a-typography-title :level="3" style="margin: 0">我的工作区</a-typography-title>
      <a-button type="primary" @click="openCreateModal">
        <PlusOutlined /> 新建工作区
      </a-button>
    </div>

    <a-empty v-if="workspaceStore.loaded && workspaceStore.workspaces.length === 0" description="暂无工作区，点击上方按钮创建">
      <a-button type="primary" @click="openCreateModal">新建工作区</a-button>
    </a-empty>

    <a-row v-else :gutter="[16, 16]">
      <a-col v-for="ws in workspaceStore.workspaces" :key="ws.id" :xs="24" :sm="12" :md="8">
        <a-card hoverable @click="openWorkspace(ws.id, ws.stage)">
          <template #title>{{ getWorkspaceDisplayName(ws.meta) }}</template>
          <template #extra>
            <a-popconfirm title="确定删除此工作区？" @confirm.stop="handleDelete(ws.id)">
              <a-button type="text" danger size="small" @click.stop>
                <DeleteOutlined />
              </a-button>
            </a-popconfirm>
          </template>
          <p>
            <a-tag
              :color="
                ws.stage === 'expanded' ? 'green' : ws.stage === 'merged' ? 'orange' : 'blue'
              "
            >
              {{
                ws.stage === 'expanded'
                  ? '已拓展'
                  : ws.stage === 'merged'
                    ? '已合并'
                    : '已识别'
              }}
            </a-tag>
          </p>
          <p style="color: #999; font-size: 13px">
            写字 {{ ws.writingChars.length }} · 识字 {{ ws.readingChars.length }} · 词语 {{ ws.vocabulary.length }}
          </p>
          <p style="color: #999; font-size: 12px">
            更新于 {{ new Date(ws.meta.updatedAt).toLocaleString('zh-CN') }}
          </p>
          <div style="text-align: right; color: #1677ff">
            进入 <RightOutlined />
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-modal
      v-model:open="createModalOpen"
      title="新建工作区"
      ok-text="创建"
      cancel-text="取消"
      :confirm-loading="creating"
      @ok="handleCreate"
    >
      <a-form layout="vertical">
        <a-form-item label="年级" required>
          <a-select v-model:value="selectedGrade" style="width: 100%">
            <a-select-option v-for="opt in GRADE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="册别" required>
          <a-radio-group v-model:value="selectedSemester">
            <a-radio-button v-for="opt in SEMESTER_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-radio-button>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
