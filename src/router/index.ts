import { createRouter, createWebHistory } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('@/views/TemplatesView.vue'),
    },
    {
      path: '/workspace/:id',
      component: () => import('@/components/layout/WorkspaceLayout.vue'),
      redirect: (to) => `/workspace/${to.params.id}/import`,
      children: [
        {
          path: 'import',
          name: 'import',
          component: () => import('@/views/workspace/ImportView.vue'),
        },
        {
          path: 'catalog',
          redirect: (to) => `/workspace/${to.params.id}/import`,
        },
        {
          path: 'tables',
          redirect: (to) => `/workspace/${to.params.id}/import`,
        },
        {
          path: 'merge',
          redirect: (to) => `/workspace/${to.params.id}/import`,
        },
        {
          path: 'expand',
          redirect: (to) => ({
            path: `/workspace/${to.params.id}/import`,
            query: {
              tab: 'expand',
              type: typeof to.query.type === 'string' ? to.query.type : 'reading',
            },
          }),
        },
        {
          path: 'export',
          name: 'export',
          component: () => import('@/views/workspace/ExportView.vue'),
        },
        // 兼容旧链接
        {
          path: 'parse',
          redirect: (to) => `/workspace/${to.params.id}/import`,
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const id = to.params.id
  if (typeof id === 'string' && id) {
    const store = useWorkspaceStore()
    if (!store.loaded) await store.init()
    store.select(id)
  }
})

export default router
