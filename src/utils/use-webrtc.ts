import { useVideoCallingStore } from '@/stores/video-calling'
import { useLog } from './use-log'
import { computed, ref, watch } from 'vue'
import { useMediaDevices } from './use-media-devices'
import type { ISignalData } from '@/types/main'
import { storeToRefs } from 'pinia'

// const peerConnectOptions: RTCConfiguration = {
//   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
//   iceCandidatePoolSize: 2,
//   iceTransportPolicy: 'relay' as const,
// }

const peerMap = ref(new Map<string, RTCPeerConnection>())
const peerList = computed(() => Array.from(peerMap.value.values()))
const localAudioSenderList = ref<RTCRtpSender[]>([])
const localVideoSenderList = ref<RTCRtpSender[]>([])

watch(peerList, () => {
  peerList.value.forEach((pc) => {
    pc.getSenders().forEach((sender) => {
      if (!sender.track) return
      if (sender.track.kind === 'audio') {
        localAudioSenderList.value.push(sender)
      } else if (sender.track.kind === 'video') {
        localVideoSenderList.value.push(sender)
      }
    })
  })
})

const remoteStreamMap = ref<Map<string, MediaStream>>(new Map())
const remoteStreamList = computed(() => Array.from(remoteStreamMap.value))

export function useWebRTC() {
  const videoCallingStore = useVideoCallingStore()
  const { myUserId, roomId, userList, socket } = storeToRefs(videoCallingStore)
  const { log } = useLog()
  const { localstream } = useMediaDevices()

  watch(localstream, () => {
    console.log('--- useWebRTC ---', localstream)
  })

  watch(
    socket,
    () => {
      console.log('!!!watch socket!!!')
      if (!socket.value) return
      socket.value.on('signal', handleSignal)
    },
    { once: true },
  )

  const emitSignalData = (data: ISignalData) => {
    if (!socket.value) {
      log('[ERROR]no socket!!!!')
      return
    }
    socket.value.emit('signal', roomId.value, data)
  }

  //  from me to others.I don't need to handle this signal.
  //  from others to me.I need to handle this signal.
  //  from others to others.I don't need to handle this signal.
  // so, I only need to handle the signal from others to me.
  const handleSignal = async (roomId: string, data: ISignalData) => {
    log('[socket: signal]', data.type)
    console.log(
      '[对方的]',
      `${data.fromUserId}->${data.toUserId}`,
      data.type,
      data.sdp ? data.sdp : data.candidate,
    )
    if (data.fromUserId && data.fromUserId === myUserId.value) return // from me to others
    if (data.toUserId && data.toUserId !== myUserId.value) return // from others to others
    switch (data.type) {
      case 'offer':
        handleOfferData(data.fromUserId!, data.sdp!)
        break
      case 'answer':
        handleAnswerData(data.fromUserId!, data.sdp!)
        break
      case 'candidate':
        handleCandidateData(data.fromUserId!, data.candidate!)
        break
      case 'hangup':
        if (data.fromUserId) {
          closePeerConnectionFor(data.fromUserId)
          clearRemoteMediaFor(data.fromUserId)
        } else {
          closeAllPeerConnections()
          clearRemoteVideos()
        }
        break
      default:
        break
    }
  }
  const handleOfferData = async (remoteUserId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(remoteUserId)
    await pc.setRemoteDescription(sdp)
    log('[pc]setRemoteDescription()')
    const answer = await pc.createAnswer()
    log('[pc]createAnswer()')
    console.log('[my answer sdp]', answer)
    await pc.setLocalDescription(answer)
    log('[pc]setLocalDescription(answer)')
    emitSignalData({
      type: 'answer',
      sdp: answer,
      fromUserId: myUserId.value,
      toUserId: remoteUserId,
    })
  }
  const handleAnswerData = async (remoteUserId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = peerMap.value.get(remoteUserId)
    if (pc) {
      await pc.setRemoteDescription(sdp)
      log('[pc]setRemoteDescription()')
    } else {
      log('[ERROR]获取peerConnect失败！in [socket: signal: answer]', remoteUserId)
    }
  }
  const handleCandidateData = async (remoteUserId: string, candidate: RTCIceCandidate) => {
    const pc = peerMap.value.get(remoteUserId)
    if (pc) {
      await pc.addIceCandidate(candidate)
      log('[pc]addIceCandidate()')
    } else {
      log('[ERROR]获取peerConnect失败！in [socket: signal: ice-candidate]', remoteUserId)
    }
  }

  const addTracks = (remoteUserId: string, pc: RTCPeerConnection) => {
    if (!localstream.value) {
      log('[ERROR]no localstream! in addTracks.')
      return
    }
    localstream.value.getTracks().forEach((track) => {
      pc.addTrack(track, localstream.value!)
      // const sender = pc.addTrack(track, localstream.value!)
      // if (track.kind === 'video') localVideoSenderMap.value.set(remoteUserId, sender)
      // if (track.kind === 'audio') localAudioSenderMap.value.set(remoteUserId, sender)
      log('[pc]addTrack(), kind:', track.kind)
    })
  }

  const createPeerConnection = (remoteUserId: string) => {
    const pc = new RTCPeerConnection()
    log('[pc]new RTCPeerConnection().', remoteUserId)

    addTracks(remoteUserId, pc)

    pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
      log('[pc: icecandidate]', (!!pc?.currentRemoteDescription).toString())
      console.log('[pc: icecandidate]', ev)
      if (ev.candidate) {
        emitSignalData({
          type: 'candidate',
          candidate: ev.candidate,
          fromUserId: myUserId.value,
          toUserId: remoteUserId,
        })
      } else {
        log('[ERROR]no candidate')
      }
    }
    pc.oniceconnectionstatechange = () => {
      log('[pc: iceconnectionstatechange], connectionState:', pc.connectionState)
    }
    // 由于远端流将音频轨道和视频轨道添加到同一个媒体流中，
    // 这里无论监听到kind属性为'video'还是'audio'，
    // 都会得到同一个 mediaStream
    pc.ontrack = (ev: RTCTrackEvent) => {
      log('[pc: track], track kind:', ev.track.kind)

      const stream = ev.streams[0]
      remoteStreamMap.value.set(remoteUserId, stream)
    }
    if (remoteUserId) peerMap.value.set(remoteUserId, pc)
    return pc
  }

  const createOffer = async (remoteUserId: string) => {
    console.log(localstream.value)
    if (!localstream.value) {
      log('[ERROR]offer 创建失败! 没有 localstream!')
      return
    }
    const pc = peerMap.value.get(remoteUserId)
    if (!pc) {
      log('[ERROR]offer 创建失败! 没有 peerConnect!')
      return
    }

    const offer = await pc.createOffer()
    log('[pc]createOffer()')
    console.log('[my offer sdp]', offer)
    await pc.setLocalDescription(offer)
    log('[pc]setLocalDescription(offer)')
    emitSignalData({
      type: 'offer',
      sdp: offer,
      fromUserId: myUserId.value,
      toUserId: remoteUserId,
    })
  }

  const publishStream = async () => {
    if (userList.value.size < 2) {
      log('房间内少于2人，无法推流')
      return
    }
    for (const receiverId of userList.value) {
      if (receiverId === myUserId.value) continue
      if (peerMap.value.has(receiverId)) continue
      createPeerConnection(receiverId)
      await createOffer(receiverId)
    }
  }
  const stopPublishStream = () => {
    if (peerMap.value.size === 0) {
      log('[WARN]没有推流连接，无需关闭')
      return
    }
    peerMap.value.forEach((_pc, remoteId) => {
      emitSignalData({
        type: 'hangup',
        fromUserId: myUserId.value,
        toUserId: remoteId,
      })
      closePeerConnectionFor(remoteId)
      clearRemoteMediaFor(remoteId)
    })
    log('已停止推流')
  }
  const closePeerConnectionFor = (remoteUserId: string) => {
    const pc = peerMap.value.get(remoteUserId)
    if (pc) {
      pc.getSenders().forEach((s) => pc.removeTrack(s))
      pc.onicecandidate = null
      pc.oniceconnectionstatechange = null
      pc.ontrack = null
      pc.close()
      peerMap.value.delete(remoteUserId)
    }
  }
  const closeAllPeerConnections = () => {
    peerMap.value.forEach((_pc, remoteId) => closePeerConnectionFor(remoteId))
  }
  const handupAll = () => {
    peerMap.value.forEach((_pc, remoteId) => {
      emitSignalData({
        type: 'hangup',
        fromUserId: myUserId.value,
        toUserId: remoteId,
      })
    })
    closeAllPeerConnections()
    clearRemoteVideos()
  }
  const clearRemoteVideos = () => {
    remoteStreamMap.value.clear()
  }
  const clearRemoteMediaFor = (remoteUserId: string) => {
    remoteStreamMap.value.delete(remoteUserId)
  }

  return {
    localAudioSenderList,
    localVideoSenderList,
    remoteStreamList,
    peerMap,
    handleSignal,
    publishStream,
    stopPublishStream,
    handupAll,
  }
}
