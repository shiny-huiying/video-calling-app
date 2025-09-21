import { createRouter, createWebHistory } from 'vue-router'
import VideoCallingView from '@/views/VideoCallingView.vue'
import { useMediaDevicesStore } from '@/stores/media-devices'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'video-calling',
      component: VideoCallingView,
      beforeEnter: async () => {
        // 注意：必须在守卫函数内部调用 useMediaDevicesStore()，
        // 而不能在路由定义的顶层调用，因为 Pinia 实例在那时可能还未被安装。
        const mediaDevicesStore = useMediaDevicesStore()
        mediaDevicesStore.setMediaDevices()
      },
    },
  ],
})

export default router
