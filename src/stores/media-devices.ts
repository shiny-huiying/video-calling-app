import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useMediaDevicesStore = defineStore('mediaDevices', () => {
  // 1. State: 推荐使用 ref() 来定义 state 属性
  const mediaDevices = ref<MediaDeviceInfo[]>([])
  const selectedAudioInput = ref<MediaDeviceInfo | null>(null)
  const selectedVideoInput = ref<MediaDeviceInfo | null>(null)

  // 2. Getters: 推荐使用 computed() 来定义 getters，它们是 state 的计算属性
  const audioInputs = computed(() =>
    mediaDevices.value.filter((info: MediaDeviceInfo) => info.kind === 'audioinput'),
  )
  const videoInputs = computed(() =>
    mediaDevices.value.filter((info: MediaDeviceInfo) => info.kind === 'videoinput'),
  )

  // 3. Actions: actions 是可以修改 state 的函数，可以是同步或异步的
  async function setMediaDevices() {
    if (!mediaDevices.value.length) {
      // 获取权限
      const stream = await window.navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      stream.getTracks().forEach((track) => track.stop())

      // 获取设备列表
      mediaDevices.value = await navigator.mediaDevices.enumerateDevices()
      // console.log('--- all devices ---')
      // console.dir(toRaw(mediaDevices.value))

      // 默认选择第一个麦克风
      if (audioInputs.value.length && !selectedAudioInput.value) {
        selectedAudioInput.value = audioInputs.value[0]
      }
      // 默认选择第一个摄像头
      if (videoInputs.value.length && !selectedVideoInput.value) {
        selectedVideoInput.value = videoInputs.value[0]
      }
    }
  }

  function selectAudioInput(device: MediaDeviceInfo) {
    selectedAudioInput.value = device
  }

  function selectVideoInput(device: MediaDeviceInfo) {
    selectedVideoInput.value = device
  }

  // 4. 必须返回需要暴露给外部的 state, getters 和 actions
  return {
    mediaDevices,
    selectedAudioInput,
    selectedVideoInput,
    audioInputs,
    videoInputs,
    setMediaDevices,
    selectAudioInput,
    selectVideoInput,
  }
})
