/**
 * @file 房间管理：进出房间，接发消息，维护用户列表
 */
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useVideoCallingStore } from '@/stores/video-calling'
import { useLog } from './use-log'
import { storeToRefs } from 'pinia'

const isJoinedRoom = ref(false)

export function useRoom() {
  const { log } = useLog()
  const videoCallingStore = useVideoCallingStore()
  const { myUserId, roomId, socket } = storeToRefs(videoCallingStore)

  const initSocket = () => {
    const socket = io('http://127.0.0.1:3000', {
      query: {
        roomId: roomId.value,
        userId: myUserId.value,
      },
    })

    socket.on('joined', handleSelfJoined)
    socket.on('leaved', handleSelfLeave)

    socket.on('user-joined', async (data: { roomId: number; userId: string }) => {
      log(`[socket: user-joined] 房间(${data.roomId})有用户加入，userId:${data.userId}`)

      videoCallingStore.addUser(data.userId)
    })
    socket.on('user-leaved', (data: { roomId: number; userId: string }) => {
      log(`房间(${data.roomId})有用户离开，userId:${data.userId})`)

      videoCallingStore.deleteUser(data.userId)
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
    videoCallingStore.updateUserList(data.userList)
    log(`已加入房间：${data.roomId}`)
  }
  const handleSelfLeave = (data: { roomId: number; userId: string }) => {
    isJoinedRoom.value = false
    log(`已离开房间：${data.roomId} (userId:${data.userId}), socketId:${socket.value?.id})`)
  }

  const joinRoom = () => {
    if (!roomId || isJoinedRoom.value) {
      log('[ERROR]请输入房间号!')
      return
    }

    const socket = initSocket()
    videoCallingStore.setSocket(socket)
    socket.emit('join', {
      roomId: roomId.value,
      userId: myUserId.value,
    })
    log(`正在加入房间：${roomId.value}`)
  }

  const leaveRoom = () => {
    if (!socket.value) {
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
    socket.value?.emit('leave', {
      roomId: roomId.value,
      userId: myUserId.value,
    })
    log(`正在离开房间：${roomId.value}`)
  }

  const disconnectSocket = () => {
    if (socket.value) {
      socket.value.disconnect()
      videoCallingStore.setSocket(null)
      isJoinedRoom.value = false
      log('socket disconnected')
    }
  }

  return {
    isJoinedRoom,
    joinRoom,
    leaveRoom,
    disconnectSocket,
  }
}
