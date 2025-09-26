<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useVideoCallingStore } from '@/stores/video-calling'

const { myUserId } = useVideoCallingStore()

const remoteVideoRef = useTemplateRef<HTMLVideoElement>('remoteVideo')

const {
  mediaStream,
  userId,
  muted = false,
} = defineProps<{
  userId: string
  mediaStream: MediaStream | null
  muted?: boolean
}>()

const figcaption = computed(() => {
  let result = userId
  if (myUserId === userId) {
    result = '(我)' + result
  }
  return result
})

const setVideoSource = () => {
  if (!mediaStream) return
  if (!remoteVideoRef.value) {
    console.warn('no remoteVideoRef!')
    return
  }
  remoteVideoRef.value.srcObject = mediaStream
  remoteVideoRef.value.play().catch((err) => {
    console.error(err)
    remoteVideoRef.value!.setAttribute('controls', 'controls')
  })
}

watch(() => mediaStream, setVideoSource)

onMounted(() => {
  setVideoSource()
})
</script>

<template>
  <figure>
    <video autoplay ref="remoteVideo" :muted="muted"></video>
    <figcaption>{{ figcaption }}</figcaption>
  </figure>
</template>

<style scoped>
figure {
  width: 320px;
  border: 1px silver solid;
  display: flex;
  flex-flow: column;
  max-width: 320px;
  margin: auto;
  box-sizing: content-box;
}

figcaption {
  background-color: #222222;
  color: white;
  font: italic smaller sans-serif;
  padding: 3px;
  text-align: center;
}

video {
  max-width: 320px;
  max-height: 180px;
  aspect-ratio: 16 / 9;
}

@media (max-width: 800px) {
  figure {
    width: 100px;

    figcaption {
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
  }
}
</style>
