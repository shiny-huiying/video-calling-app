<script setup lang="ts">
import { ref, useTemplateRef, onUnmounted } from 'vue'
import { v4 as uuid } from 'uuid'
import { io, Socket } from 'socket.io-client'
import { useMediaDevicesStore } from '@/stores/media-devices'
import { useLog } from '@/utils/log'
import { useMediaDevices } from '@/utils/media-devices'

const mediaDevicesStore = useMediaDevicesStore()
const { logList, log } = useLog()
const {
  localstream,
  localVideoRef,
  getMedia,
  stopMedia,
  toggleVideoStatus,
  videoStatus,
  toggleAudioStatus,
  audioStatus,
  isCapturing,
} = useMediaDevices()

// types
type SignalType = 'offer' | 'answer' | 'candidate' | 'hangup'
interface ISignalData {
  type: SignalType
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidate
}

// utils
const getShortUserId = (userId: string) => {
  return userId.split('-')[0]
}

let peerConnect: RTCPeerConnection | null = null
let socket: Socket | null = null

// const peerConnectOptions: RTCConfiguration = {
//   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
//   iceCandidatePoolSize: 2,
//   iceTransportPolicy: 'relay' as const,
// }

const myUserId = ref(uuid())
const roomId = ref<number>(10086)
const nick = ref<string>('游客' + myUserId.value)
const isJoinedRoom = ref(false)
const userList = ref<Set<string>>(new Set())
const remoteVideo = useTemplateRef<HTMLVideoElement | null>('remoteVideo')
const videoList = useTemplateRef<HTMLElement | null>('videoList')
let localVideoSender: RTCRtpSender | null = null
let localAudioSender: RTCRtpSender | null = null

const joinRoom = () => {
  if (!roomId.value || isJoinedRoom.value) {
    log('[ERROR]请输入房间号!')
    return
  }

  socket = initSocket()
  socket.emit('join', {
    roomId: roomId.value,
    userId: myUserId.value,
  })
  log(`正在加入房间：${roomId.value}`)
}

const leaveRoom = () => {
  if (!socket) {
    log('[ERROR]no socket!!!!')
    return
  }
  if (!isJoinedRoom.value) {
    log('[WARN]未加入房间，无需退出')
    return
  }
  if (!roomId.value) {
    log('[ERROR]请输入房间号！')
  }
  socket.emit('leave', {
    roomId: roomId.value,
    userId: myUserId.value,
  })
  log(`正在离开房间：${roomId.value}`)
}

const initSocket = () => {
  const socket = io('http://127.0.0.1:3000', {
    query: {
      roomId: roomId.value,
      userId: myUserId.value,
      nick: nick.value,
    },
  })

  socket.on('joined', handleSelfJoined)
  socket.on('leaved', handleSelfLeave)
  socket.on('signal', handleSignal)
  socket.on('full', (data: { roomId: string }) => {
    log(`[socket: full] 无法加入房间(${data.roomId})，因为已满员`)
  })

  socket.on('user-joined', async (data: { roomId: number; userId: string }) => {
    log(
      `[socket: user-joined] 房间(${data.roomId})有用户加入，userId:${getShortUserId(data.userId)}`,
    )

    userList.value.add(data.userId)
  })
  socket.on('user-leaved', (data: { roomId: number; userId: string }) => {
    log(`房间(${data.roomId})有用户离开，userId:${getShortUserId(data.userId)})`)

    userList.value.delete(data.userId)
  })

  // setInterval(() => {
  //   fetch('http://localhost:3000/userlist')
  //     .then((res) => res.json())
  //     .then((data) => {
  //       userList.value = new Set(data.userList as string[])
  //     })
  //     .catch((err) => {
  //       log('fetch userlist error', err)
  //     })
  // }, 1000)

  return socket
}
const handleSelfJoined = async (data: { roomId: number; userList: string[] }) => {
  isJoinedRoom.value = true
  userList.value = new Set(data.userList)
  log(`已加入房间：${data.roomId}, ${data.userList.join(',')}`)
}
const handleSelfLeave = (data: { roomId: number; userId: string }) => {
  isJoinedRoom.value = false
  log(`已离开房间：${data.roomId} (userId:${data.userId}), socketId:${socket?.id})`)
}
const handleSignal = async (roomId: string, data: ISignalData) => {
  log('[socket: signal]', data.type)
  console.log('[对方的]', data.type, data.sdp ? data.sdp : data.candidate)
  switch (data.type) {
    case 'offer':
      handleOfferData(data.sdp!)
      break
    case 'answer':
      handleAnswerData(data.sdp!)
      break
    case 'candidate':
      handleCandidateData(data.candidate!)
      break
    case 'hangup':
      closePeerConnection()
      clearRemoteVideos()
      break
    default:
      break
  }
}
const handleOfferData = async (sdp: RTCSessionDescriptionInit) => {
  peerConnect = createPeerConnection()
  await peerConnect!.setRemoteDescription(sdp)
  log('[pc]setRemoteDescription()')
  const answer = await peerConnect!.createAnswer()
  log('[pc]createAnswer()')
  console.log('[my answer sdp]', answer)
  await peerConnect!.setLocalDescription(answer)
  log('[pc]setLocalDescription()')
  socket!.emit('signal', roomId.value, {
    type: 'answer',
    sdp: answer,
  })
}
const handleAnswerData = async (sdp: RTCSessionDescriptionInit) => {
  if (peerConnect) {
    await peerConnect.setRemoteDescription(sdp)
    log('[pc]setRemoteDescription()')
  } else {
    log('[ERROR]获取peerConnect失败！in [socket: signal: answer]')
  }
}
const handleCandidateData = async (candidate: RTCIceCandidate) => {
  if (peerConnect) {
    await peerConnect.addIceCandidate(candidate)
    log('[pc]addIceCandidate()')
  } else {
    log('[ERROR]获取peerConnect失败！in [socket: signal: ice-candidate]')
  }
}

const addTracks = (pc: RTCPeerConnection) => {
  if (!localstream.value) {
    log('[ERROR]no localstream! in addTracks.')
    return
  }
  localstream.value.getTracks().forEach((track) => {
    const sender = pc.addTrack(track, localstream.value!)
    if (track.kind === 'video') localVideoSender = sender
    if (track.kind === 'audio') localAudioSender = sender
    log('[pc]addTrack(), kind:', track.kind)
  })
}

const createPeerConnection = () => {
  peerConnect = new RTCPeerConnection()
  log('[pc]new RTCPeerConnection().')

  addTracks(peerConnect)

  peerConnect.addEventListener('icecandidate', (ev: RTCPeerConnectionIceEvent) => {
    log('[pc: icecandidate]', (!!peerConnect?.currentRemoteDescription).toString())
    console.log('[pc: icecandidate]', ev)
    if (ev.candidate) {
      socket!.emit('signal', roomId.value, {
        type: 'candidate',
        candidate: ev.candidate,
      })
    } else {
      log('[ERROR]no candidate')
    }
  })
  peerConnect.addEventListener('iceconnectionstatechange', () => {
    log('[pc: iceconnectionstatechange], connectionState:', peerConnect!.connectionState)
  })
  peerConnect.addEventListener('track', (ev: RTCTrackEvent) => {
    log('[pc: track], track kind:', ev.track.kind)

    if (ev.track.kind === 'video') {
      if (remoteVideo.value) {
        remoteVideo.value.srcObject = ev.streams[0]
        remoteVideo.value.setAttribute('data-trackid', ev.track.id)
        // 处理可能的自动播放限制
        remoteVideo.value.play().catch((err) => {
          log('[ERROR]视频播放失败:', err.message)
          // 如果自动播放失败，可以提示用户手动点击播放
          remoteVideo.value!.setAttribute('controls', 'controls')
        })
        console.log('远端视频流已设置:', remoteVideo.value.srcObject)
        console.log('视频轨道状态:', ev.track.enabled, 'readyState:', ev.track.readyState)
      } else {
        log('[ERROR]remoteVideo元素未找到')
      }
    }
    if (ev.track.kind === 'audio') {
      if (videoList.value) {
        const audio = document.createElement('audio')
        audio.srcObject = ev.streams[0]
        audio.autoplay = true
        audio.hidden = true
        audio.setAttribute('data-trackid', ev.track.id)
        videoList.value.appendChild(audio)

        const removeIfMatches = (trackId: string) => {
          const container = videoList.value!
          const el = container.querySelector(`[data-trackid="${trackId}"]`)
          if (el && el.parentElement) {
            el.parentElement.removeChild(el)
          }
        }

        ev.track.addEventListener('ended', () => removeIfMatches(ev.track.id))
        ev.streams[0].addEventListener('removetrack', (e: MediaStreamTrackEvent) => {
          if (e.track.id === ev.track.id) removeIfMatches(ev.track.id)
        })
      }
    }
  })
  return peerConnect
}

const createOffer = async () => {
  if (!localstream.value) {
    log('[ERROR]offer 创建失败! 没有 localstream!')
    return
  }
  if (!peerConnect) {
    log('[ERROR]offer 创建失败! 没有 peerConnect!')
    return
  }

  const offer = await peerConnect.createOffer()
  log('[pc]createOffer()')
  console.log('[my offer sdp]', offer)
  await peerConnect.setLocalDescription(offer)
  log('[pc]setLocalDescription()')
  socket!.emit('signal', roomId.value, {
    type: 'offer',
    sdp: offer,
  })
}

const publishStream = async () => {
  if (userList.value.size < 2) {
    log('房间内少于2人，无法推流')
    return
  }
  if (peerConnect) {
    log('[WARN]已有推流连接，跳过重复创建')
    return
  }
  createPeerConnection()
  await createOffer()
}
const stopPublishStream = () => {
  if (!peerConnect) {
    log('[WARN]没有推流连接，无需关闭')
    return
  }
  socket?.emit('signal', roomId.value, {
    type: 'hangup',
  })
  closePeerConnection()
  clearRemoteVideos()
  log('已停止推流')
}
const closePeerConnection = () => {
  if (peerConnect) {
    peerConnect.close()
    peerConnect = null
    log('已关闭连接')
  }
}
const clearRemoteVideos = () => {
  if (videoList.value) {
    videoList.value.innerHTML = ''
  }
  if (remoteVideo.value) {
    remoteVideo.value.srcObject = null
  }
}

// Seamless device switching via replaceTrack
const switchVideoDevice = async (deviceId: string) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: 640, height: 360 },
      audio: false,
    })
    const newTrack = stream.getVideoTracks()[0]
    const oldTrack = localstream.value?.getVideoTracks()[0]

    if (localVideoSender) {
      await localVideoSender.replaceTrack(newTrack)
    }

    if (localstream.value) {
      if (oldTrack) {
        localstream.value.removeTrack(oldTrack)
        oldTrack.stop()
      }
      localstream.value.addTrack(newTrack)
    }

    if (localVideoRef.value && localstream.value) {
      localVideoRef.value.srcObject = localstream.value
    }
  } catch (err) {
    log('[ERROR]切换视频设备失败', (err as Error).message)
  }
}

const switchAudioDevice = async (deviceId: string) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { deviceId: { exact: deviceId } },
    })
    const newTrack = stream.getAudioTracks()[0]
    const oldTrack = localstream.value?.getAudioTracks()[0]

    if (localAudioSender) {
      await localAudioSender.replaceTrack(newTrack)
    }

    if (localstream.value) {
      if (oldTrack) {
        localstream.value.removeTrack(oldTrack)
        oldTrack.stop()
      }
      localstream.value.addTrack(newTrack)
    }
  } catch (err) {
    log('[ERROR]切换音频设备失败', (err as Error).message)
  }
}

const onVideoInputChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const deviceId = target?.value
  if (deviceId) {
    mediaDevicesStore.selectVideoInput(deviceId)
    if (localstream.value) {
      switchVideoDevice(target.value)
    }
  }
}
const onAudioInputChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const deviceId = target?.value
  if (deviceId) {
    mediaDevicesStore.selectAudioInput(deviceId)
    if (localstream.value) {
      switchAudioDevice(deviceId)
    }
  }
}

onUnmounted(() => {
  try {
    socket?.emit('signal', roomId.value, { type: 'hangup' })
  } catch {}
  closePeerConnection()
  clearRemoteVideos()
  stopMedia()
  socket?.disconnect()
  socket = null
})
</script>

<template>
  <p class="tips">连麦流程：双方都“开始”采集音视频并已“加入房间”，其中一方点击“开始推流”</p>
  <div class="video-calling">
    <div class="video-calling__videos">
      <figure>
        <video ref="localVideo" src="" autoplay muted></video>
        <figcaption>本地预览</figcaption>
      </figure>
      <figure>
        <video ref="remoteVideo" src="" autoplay></video>
        <figcaption>远端用户</figcaption>
      </figure>
      <div class="video-calling__videos__remote" ref="videoList"></div>
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
          <label for="nick" :disabled="isJoinedRoom">
            昵称：<input type="text" name="nick" id="nick" v-model="nick" />
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
video {
  width: 320px;
  aspect-ratio: 16 / 9;
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
figure {
  border: 1px silver solid;
  display: flex;
  flex-flow: column;
  max-width: 320px;
  margin: auto;
  box-sizing: content-box;
}
video {
  max-width: 320px;
  max-height: 180px;
}

figcaption {
  background-color: #222222;
  color: white;
  font: italic smaller sans-serif;
  padding: 3px;
  text-align: center;
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
  video {
    width: 100px;
  }

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
