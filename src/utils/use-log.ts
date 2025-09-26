import { ref } from 'vue'

const logList = ref<string[]>([])

export function useLog() {
  const log = (...infos: string[]) => {
    logList.value.push(infos.join(''))
    console.log(...infos)
  }
  return {
    logList,
    log,
  }
}
