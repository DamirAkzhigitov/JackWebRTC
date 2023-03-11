<template>
  <div>
    <div>
      <v-btn @click="openUserMedia">
        <span>Open camera & microphone</span>
      </v-btn>
      <v-btn :disabled="createBtnDisabled" @click="createRoom">
        <span>Create room</span>
      </v-btn>
      <v-btn :disabled="joinBtnDisabled" disabled @click="joinRoom">
        <span>Join room</span>
      </v-btn>
      <v-btn :disabled="hangupBtnDisabled" disabled @click="hangUp">
        <span>Hangup</span>
      </v-btn>
    </div>
    <div>
      <span> currentRoom = {{ currentRoom }}</span>
    </div>
    <div>
      <v-card>
        <v-card-title> localVideo </v-card-title>
        <v-card-text>
          <video ref="localVideo" muted autoplay playsinline width="400" />
        </v-card-text>
      </v-card>
      <v-card>
        <v-card-title> remoteVideo </v-card-title>
        <v-card-text>
          <video ref="remoteVideo" muted width="400" />
        </v-card-text>
      </v-card>
    </div>
    <v-card v-if="joinDialogOpen">
      <v-card-title id="my-dialog-title"> Join room </v-card-title>
      <v-card-text id="my-dialog-content">
        <span>Enter ID for room to join:</span>
        <v-text-field
          v-model="roomId"
          label="Room ID"
          type="text"
          id="room-id"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn type="button" @click="cancelJoin"> Cancel </v-btn>
        <v-btn id="confirmJoinBtn" @click="confirmJoinBtn"> Join </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { db } from '../plugins/firebase'
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  setDoc
} from 'firebase/firestore'

// DEfault configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    }
  ],
  iceCandidatePoolSize: 10
}

let peerConnection = null
let localStream = null
const remoteStream = ref(new MediaStream())

const callerCandidatesString = 'callerCandidates'
const calleeCandidatesString = 'calleeCandidates'

const stableConnection = ref(false)
const localVideo = ref(null)
const remoteVideo = ref(null)
const roomId = ref('')
const currentRoom = ref('')
const createBtnDisabled = ref(false)
const joinBtnDisabled = ref(false)
const cameraBtnDisabled = ref(false)
const hangupBtnDisabled = ref(false)
const joinDialogOpen = ref(false)
const roomCollection = collection(db, 'rooms')

const collectIceCandidates = async (
  roomRef,
  peerConnection,
  localName,
  remoteName
) => {
  const localCandidatesCollection = collection(roomRef, localName)
  const remoteCandidatesCollection = collection(roomRef, remoteName)

  peerConnection.addEventListener('icecandidate', (event) => {
    if (!event.candidate) {
      console.log('Got final candidate!')
      return
    }
    console.log('Got candidate: ', event.candidate)
    addDoc(localCandidatesCollection, event.candidate.toJSON())
  })

  onSnapshot(remoteCandidatesCollection, (snapshot) => {
    console.log('onSnapShot remoteCandidatesCollection changes')
    snapshot.docChanges().forEach(async (change) => {
      console.log('onSnapShot remoteCandidatesCollection, change: ', change)
      if (change.type === 'added') {
        let data = change.doc.data()
        console.log('Got new remote ICE candidate:', data)
        await peerConnection.addIceCandidate(new RTCIceCandidate(data))
      }
    })
  })
}

const createRoom = async () => {
  createBtnDisabled.value = true
  joinBtnDisabled.value = true
  console.log('Create PeerConnection with configuration: ', configuration)
  peerConnection = new RTCPeerConnection(configuration)
  const roomRef = await addDoc(roomCollection, {
    exist: true
  })

  registerPeerConnectionListeners()

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream)
  })

  console.log('start awaiting')
  await collectIceCandidates(
    roomRef,
    peerConnection,
    callerCandidatesString,
    calleeCandidatesString
  )
  console.log('awaiting finished')

  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)

  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp
    }
  }

  await setDoc(roomRef, roomWithOffer)

  currentRoom.value = `Current room is ${roomRef.id} - You are the caller!`

  peerConnection.addEventListener('track', (event) => {
    console.log('Got remote track:', event.streams[0])
    event.streams[0].getTracks().forEach((track) => {
      console.log('Add a track to the remoteStream:', track)
      awaiterStableConnection(() => {
        remoteStream.value.addTrack(track)
      })
    })
  })

  // const callerCandidatesCollection = collection(roomRef, 'callerCandidates')
  //
  // peerConnection.addEventListener('icecandidate', (event) => {
  //   if (!event.candidate) {
  //     console.log('Got final candidate!')
  //     return
  //   }
  //   console.log('Got candidate: ', event.candidate)
  //   addDoc(callerCandidatesCollection, event.candidate.toJSON())
  // })

  // Code for collecting ICE candidates above

  // Listening for remote session description below
  onSnapshot(
    roomRef,
    async (snapshot) => {
      const data = snapshot.data()
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        console.log('Got remote description: ', data.answer)
        const rtcSessionDescription = new RTCSessionDescription(data.answer)
        await peerConnection.setRemoteDescription(rtcSessionDescription)
      }
    },
    (error) => {
      console.error('onSnapshot, roomRef, error: ', error)
    }
  )
  // Listening for remote session description above

  // const calleCandidatesRoom = collection(roomRef, 'calleeCandidates')
  //
  // console.log('calleCandidatesRoom: ', calleCandidatesRoom)
  //
  // // Listen for remote ICE candidates below
  // onSnapshot(
  //   calleCandidatesRoom,
  //   (snapshot) => {
  //     console.log('!onSnapshot!, calleCandidatesRoom')
  //     snapshot.docChanges().forEach(async (change) => {
  //       console.log('calleCandidatesRoom, docChanges:', change)
  //       if (change.type === 'added') {
  //         let data = change.doc.data()
  //         console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
  //         await peerConnection.addIceCandidate(new RTCIceCandidate(data))
  //       }
  //     })
  //   },
  //   (error) => {
  //     console.error('calleCandidatesRoom error onSnapshot: ', error)
  //   }
  // )
  // Listen for remote ICE candidates above
}
const confirmJoinBtn = async () => {
  currentRoom.value = `Current room is ${roomId.value} - You are the callee!`
  await joinRoomById(roomId.value)
  joinDialogOpen.value = false
}

const joinRoom = () => {
  createBtnDisabled.value = true
  joinBtnDisabled.value = true
  joinDialogOpen.value = true
  // roomDialog.open()
}

const cancelJoin = () => {
  joinDialogOpen.value = false
  createBtnDisabled.value = false
  joinBtnDisabled.value = false
}

const awaiterStableConnection = (cb) => {
  console.log('awaiterStableConnection running')
  if (stableConnection.value) {
    console.log('awaiterStableConnection ready!')
    cb()
  } else {
    setTimeout(() => {
      awaiterStableConnection(cb)
    }, 1000)
  }
}

const joinRoomById = async (roomId) => {
  console.group('joinRoomById, roomId: ', roomId)
  const roomRef = doc(db, 'rooms', roomId)
  // const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates')
  const roomSnapshot = await getDoc(roomRef)

  console.log('Room roomSnapshot.exists(): ', roomSnapshot.exists())
  if (roomSnapshot.exists()) {
    console.log('Create PeerConnection with configuration: ', configuration)
    peerConnection = new RTCPeerConnection(configuration)
    registerPeerConnectionListeners()

    console.log('registerPeerConnectionListeners, localStream: ', localStream)

    localStream.getTracks().forEach((track) => {
      console.log('1. add track to peerConnection')
      peerConnection.addTrack(track, localStream)
    })

    await collectIceCandidates(
      roomRef,
      peerConnection,
      callerCandidatesString,
      calleeCandidatesString
    )

    peerConnection.addEventListener('track', (event) => {
      console.log('Got remote track:', event.streams[0])
      event.streams[0].getTracks().forEach((track) => {
        console.log(
          'stable: ',
          stableConnection.value,
          ', Add a track to the remoteStream:',
          track
        )
        awaiterStableConnection(() => {
          remoteStream.value.addTrack(track)
        })
      })
    })

    // Code for collecting ICE candidates below
    // peerConnection.addEventListener('icecandidate', async (event) => {
    //   console.log('peerConnection event icecandidate : ', event)
    //   if (!event.candidate) {
    //     console.log('Got final candidate!')
    //     return
    //   }
    //   console.log('Got candidate: ', event.candidate)
    //   const candidateRef = await addDoc(
    //     calleeCandidatesCollection,
    //     event.candidate.toJSON()
    //   )
    //   console.log('candidateRef: ', candidateRef)
    // })
    // Code for collecting ICE candidates above

    // Code for creating SDP answer below

    const offer = roomSnapshot.data().offer

    console.log('offer: ', offer)

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await peerConnection.createAnswer()

    console.log('answer: ', answer)

    await peerConnection.setLocalDescription(answer)

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    }
    await updateDoc(roomRef, roomWithAnswer)

    // onSnapshot(
    //   calleeCandidatesCollection,
    //   (snapshot) => {
    //     console.log('onSnapshot, calleeCandidatesCollection: ', snapshot)
    //     snapshot.docChanges().forEach(async (change) => {
    //       console.log('SNAPSHOT.docChanges(), change: ', change)
    //       if (change.type === 'added') {
    //         let data = change.doc.data()
    //         console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
    //         await peerConnection.addIceCandidate(new RTCIceCandidate(data))
    //       }
    //     })
    //   },
    //   (error) => {
    //     console.error('calleeCandidatesCollection onSnapshot error: ', error)
    //   }
    // )
  }
  console.groupEnd()
}

const openUserMedia = async (e) => {
  console.log('openUserMedia')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  })
  localVideo.value.srcObject = stream
  console.log('set localStream')
  localStream = stream
  remoteVideo.value.srcObject = remoteStream.value
  remoteVideo.value.autoplay = true
  remoteVideo.value.playsInline = true
  remoteVideo.value.muted = true
  console.log('remoteVideo.value: ', remoteVideo.value)

  console.log('Stream:', localVideo.value.srcObject)
  createBtnDisabled.value = false
  joinBtnDisabled.value = false
  cameraBtnDisabled.value = true
  hangupBtnDisabled.value = false
}

const hangUp = async (e) => {
  const tracks = localVideo.value.srcObject.getTracks()
  tracks.forEach((track) => {
    track.stop()
  })

  if (remoteStream.value) {
    remoteStream.value.getTracks().forEach((track) => track.stop())
  }

  if (peerConnection) {
    peerConnection.close()
  }

  localVideo.value.srcObject = null
  remoteVideo.value.srcObject = null
  cameraBtnDisabled.value = false
  joinBtnDisabled.value = true
  createBtnDisabled.value = true
  hangupBtnDisabled.value = true
  currentRoom.value = ''

  // Delete room on hangup
  if (roomId.value) {
    const roomRef = doc(db, 'rooms', roomId.value)
    const calleeCandidates = collection(roomRef, 'calleeCandidates')
    calleeCandidates.forEach(async (candidate) => {
      await candidate.delete()
    })
    const callerCandidates = collection(roomRef, 'callerCandidates')
    callerCandidates.forEach(async (candidate) => {
      await candidate.delete()
    })
    await deleteDoc(roomRef)
  }

  document.location.reload(true)
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    )
  })

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`)
  })

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`)
    stableConnection.value = peerConnection.signalingState === 'stable'
  })

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    )
  })
}
</script>

<style scoped></style>
