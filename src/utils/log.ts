import { ref } from 'vue'
export function useLog() {
  const logList = ref<string[]>([])
  const log = (...infos: string[]) => {
    logList.value.push(infos.join(''))
    console.log(...infos)
  }
  return {
    log,
    logList,
  }
}
