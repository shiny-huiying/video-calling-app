import { ref } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuid } from 'uuid'
import type { Socket } from 'socket.io-client'

export const useVideoCallingStore = defineStore('videoCalling', () => {
  const myUserId = ref(uuid())
  const roomId = ref<number>(10086)

  const socket = ref<Socket | null>(null)
  const setSocket = (s: Socket | null) => {
    socket.value = s
  }

  const userList = ref<Set<string>>(new Set())
  const addUser = (userId: string) => {
    userList.value.add(userId)
  }
  const deleteUser = (userId: string) => {
    userList.value.delete(userId)
  }
  const updateUserList = (list: string[]) => {
    userList.value = new Set(list)
  }

  return {
    myUserId,
    roomId,

    socket,
    setSocket,

    userList,
    addUser,
    deleteUser,
    updateUserList,
  }
})
