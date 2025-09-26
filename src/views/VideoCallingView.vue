<script setup lang="ts">
import { onUnmounted } from 'vue'
import VideoItem from '@/components/VideoItem.vue'
import { useVideoCallingStore } from '@/stores/video-calling'
import { useLog } from '@/utils/use-log'
import { useMediaDevices } from '@/utils/use-media-devices'
import { useWebRTC } from '@/utils/use-webrtc'
import { useRoom } from '@/utils/use-room'
import { useMediaDevicesStore } from '@/stores/media-devices'
import { storeToRefs } from 'pinia'

const videoCallingStore = useVideoCallingStore()
const mediaDevicesStore = useMediaDevicesStore()
const { myUserId, roomId } = storeToRefs(videoCallingStore)
const { logList, log } = useLog()
const { isJoinedRoom, joinRoom, leaveRoom, disconnectSocket } = useRoom()
const {
  localstream,
  isCapturing,
  videoStatus,
  audioStatus,
  getMedia,
  stopMedia,
  toggleAudioStatus,
  toggleVideoStatus,
} = useMediaDevices()
const {
  localAudioSenderList,
  localVideoSenderList,
  remoteStreamList,
  publishStream,
  stopPublishStream,
  handupAll,
} = useWebRTC()

const updateLocalstream = async (type: 'video' | 'audio', deviceId: string) => {
  if (!localstream.value) return

  const isAudio = type === 'audio'

  const constraints = isAudio
    ? {
        video: false,
        audio: { deviceId: { exact: deviceId } },
      }
    : {
        video: { deviceId: { exact: deviceId }, width: 640, height: 360 },
        audio: false,
      }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (!localstream.value) return
    let newTrack = null
    let oldTrack = null
    if (isAudio) {
      newTrack = stream.getAudioTracks()[0]
      oldTrack = localstream.value.getAudioTracks()[0]

      for (const sender of localAudioSenderList.value) {
        await sender.replaceTrack(newTrack)
      }
    } else {
      newTrack = stream.getVideoTracks()[0]
      oldTrack = localstream.value.getVideoTracks()[0]

      for (const sender of localVideoSenderList.value) {
        await sender.replaceTrack(newTrack)
      }
    }

    if (oldTrack) {
      localstream.value.removeTrack(oldTrack)
      oldTrack.stop()
    }
    localstream.value.addTrack(newTrack)
  } catch (err) {
    log(`[ERROR]切换${isAudio ? '音频' : '视频'}设备失败`, (err as Error).message)
  }
}

const onVideoInputChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const deviceId = target?.value
  if (!deviceId) return

  mediaDevicesStore.switchVideoInput(deviceId)
  updateLocalstream('video', deviceId)
}

const onAudioInputChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const deviceId = target?.value
  if (!deviceId) return

  mediaDevicesStore.switchAudioInput(deviceId)
  updateLocalstream('audio', deviceId)
}

onUnmounted(() => {
  handupAll()
  stopMedia()
  disconnectSocket()
})
</script>

<template>
  <p class="tips">连麦流程：双方都“开始”采集音视频并已“加入房间”，其中一方点击“开始推流”</p>
  <div class="video-calling">
    <div class="video-calling__videos">
      <VideoItem :user-id="myUserId" :media-stream="localstream" :muted="true" />
      <VideoItem
        v-for="[userId, mediaStream] in remoteStreamList"
        :key="userId"
        :user-id="userId"
        :media-stream="mediaStream"
      />
    </div>
    <div class="video-calling__controls">
      <div class="video-calling__controls__operate">
        <fieldset>
          <legend>选择推流设备</legend>

          <select name="videoInput" id="videoInput" @change="onVideoInputChange">
            <option
              v-for="val in mediaDevicesStore.videoInputs"
              :value="val.deviceId"
              :key="val.deviceId"
            >
              {{ val.label }}
            </option>
          </select>
          <br />

          <select name="audioInput" id="audioInput" @change="onAudioInputChange">
            <option
              v-for="val in mediaDevicesStore.audioInputs"
              :value="val.deviceId"
              :key="val.deviceId"
            >
              {{ val.label }}
            </option>
          </select>
        </fieldset>

        <fieldset>
          <legend>设备开关状态</legend>
          <label for="videoStatus">摄像头：{{ videoStatus ? '✅已打开' : '❌已关闭' }}</label>
          <button name="videoStatus" id="videoStatus" @click="toggleVideoStatus">切换开关</button>
          <br />

          <label for="audioStatus">麦克风：{{ audioStatus ? '✅已打开' : '❌已关闭' }}</label>
          <button name="audioStatus" id="audioStatus" @click="toggleAudioStatus">切换开关</button>
        </fieldset>
        <fieldset>
          <legend>采集音视频</legend>
          <button @click="getMedia" :disabled="!!localstream || isCapturing">开始</button>
          <button @click="stopMedia" :disabled="!localstream">停止</button>
        </fieldset>
        <fieldset>
          <legend>房间</legend>
          <label for="roomId" :disabled="isJoinedRoom">
            房间号：<input type="number" name="roomId" id="roomId" v-model="roomId" />
          </label>
          <br />
          <button @click="joinRoom" :disabled="!localstream || isJoinedRoom">加入房间</button>
          <button @click="leaveRoom" :disabled="!isJoinedRoom">离开房间</button>
        </fieldset>
        <fieldset :disabled="!localstream || !isJoinedRoom">
          <button @click="publishStream">开始推流</button>
          <button @click="stopPublishStream">停止推流</button>
        </fieldset>
      </div>
      <div class="video-calling__controls__log">
        <!-- <p>用户列表</p>
        <ul>
          <li v-for="userId in userList" :key="userId">{{ userId }}</li>
        </ul> -->
        <p>日志打印：</p>
        <ul>
          <li v-for="(val, i) in logList" :key="i">{{ val }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tips {
  margin: 0 0.5rem;
}

button + button {
  margin-left: 0.5rem;
}
.video-calling__controls__log {
  border: 1px solid #eee;
  p {
    background: #eee;
  }

  ul {
    height: 380px;
    overflow: auto;
    padding-inline-start: 1.5em;
  }
}

.video-calling,
.video-calling__controls {
  display: flex;
  flex-flow: row nowrap;
  align-items: flex-start;
  justify-content: space-around;
}
.video-calling__videos,
.video-calling__controls__operate,
.video-calling__controls__log {
  margin: 0.5rem;
}
.video-calling__controls,
.video-calling__controls__log {
  flex-grow: 1;
}
@media (max-width: 800px) {
  .video-calling {
    display: block;
  }
  .video-calling__videos {
    display: flex;
    justify-content: flex-start;
    > * {
      margin: 0 0.5rem;
    }
  }
}
</style>
