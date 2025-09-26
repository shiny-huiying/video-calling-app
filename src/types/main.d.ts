type ISignalType = 'offer' | 'answer' | 'candidate' | 'hangup'

interface ISignalData {
  type: ISignalType
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidate
  fromUserId?: string
  toUserId?: string
}

export { ISignalData }
