import { ref, useTemplateRef, toRaw } from 'vue'
import { useMediaDevicesStore } from '@/stores/media-devices'

const logEnable = false
// 是否默认关闭音频
const audioEnable = false

export function useMediaDevices() {
  const mediaDevicesStore = useMediaDevicesStore()
  const localVideoRef = useTemplateRef<HTMLVideoElement>('localVideo')
  const localstream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)

  const logStreamInfo = (stream: MediaStream) => {
    console.log(
      '【科普】',
      '「约束」是一种指定您需要、想要以及愿意接受各种可约束属性的值的方式，',
      '「设置」是当前每个可约束属性的实际值。',
      '「能力」是浏览器和设备支持的所有可能值的范围。',
      'https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints#retrieving_current_constraints_and_settings',
    )
    console.log('--- AudioTrack ---')
    stream.getAudioTracks().forEach((track) => {
      console.log('Constraints:')
      console.dir(track.getConstraints())
      console.log('Settings:')
      console.dir(track.getSettings())
      console.log('Capabilities:')
      console.dir(track.getCapabilities())
    })
    console.log('--- VideoTrack ---')
    stream.getVideoTracks().forEach((track) => {
      console.log('Constraints:')
      console.dir(track.getConstraints())
      console.log('Settings:')
      console.dir(track.getSettings())
      console.log('Capabilities:')
      console.dir(track.getCapabilities())
    })
  }
  const logInputDevices = () => {
    console.log('--- devices ---')
    console.log('audio inputs:', toRaw(mediaDevicesStore.audioInputs))
    console.log('video inputs:', toRaw(mediaDevicesStore.videoInputs))
  }

  const getMedia = async () => {
    if (isCapturing.value) return
    isCapturing.value = true
    try {
      const videoDeviceId = mediaDevicesStore.selectedVideoInput?.deviceId
      const audioDeviceId = mediaDevicesStore.selectedAudioInput?.deviceId
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
          width: 640,
          height: 360,
        },
        audio: {
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
        },
      }
      const mediaStream = (localstream.value =
        await navigator.mediaDevices.getUserMedia(constraints))
      if (!videoStatus.value) {
        mediaStream.getVideoTracks().forEach((t) => (t.enabled = false))
      }
      if (!audioStatus.value) {
        mediaStream.getAudioTracks().forEach((t) => (t.enabled = false))
      }
      if (localVideoRef.value) {
        localVideoRef.value.srcObject = localstream.value
      }

      if (logEnable) {
        logStreamInfo(mediaStream)
        logInputDevices()
      }
    } catch (err) {
      console.error('[getUserMedia] error:', err)
      // Re-throw so caller can handle (toast/log)
      throw err
    } finally {
      isCapturing.value = false
    }
  }

  const stopMedia = () => {
    try {
      if (localstream.value) {
        localstream.value.getTracks().forEach((track) => track.stop())
      }
      if (localVideoRef.value) {
        localVideoRef.value.srcObject = null
      }
    } finally {
      localstream.value = null
    }
  }

  const videoStatus = ref(true)
  const toggleVideoStatus = () => {
    videoStatus.value = !videoStatus.value
    if (localstream.value) {
      localstream.value.getVideoTracks().forEach((track) => (track.enabled = videoStatus.value))
    }
  }

  const audioStatus = ref(audioEnable)
  const toggleAudioStatus = () => {
    audioStatus.value = !audioStatus.value
    if (localstream.value) {
      localstream.value.getAudioTracks().forEach((track) => (track.enabled = audioStatus.value))
    }
  }

  return {
    localstream,
    getMedia,
    stopMedia,
    toggleVideoStatus,
    videoStatus,
    toggleAudioStatus,
    audioStatus,
    localVideoRef,
    isCapturing,
  }
}
