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
      <video ref="localVideo" muted autoplay playsinline />
      <video ref="remoteVideo" autoplay playsinline />
    </div>
    <v-card>
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
        <v-btn type="button"> Cancel </v-btn>
        <v-btn id="confirmJoinBtn"> Join </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { db } from '../plugins/firebase'
import { collection } from 'firebase/firestore/lite'

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
let remoteStream = null
// const roomDialog = ref(null)

const localVideo = ref(null)
const remoteVideo = ref(null)
const roomId = ref('')
const currentRoom = ref('')
const createBtnDisabled = ref(false)
const joinBtnDisabled = ref(false)
const cameraBtnDisabled = ref(false)
const hangupBtnDisabled = ref(false)

const createRoom = async () => {
  createBtnDisabled.value = true
  joinBtnDisabled.value = true
  console.log('Create PeerConnection with configuration: ', configuration)
  peerConnection = new RTCPeerConnection(configuration)

  registerPeerConnectionListeners()

  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)

  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp
    }
  }
  const roomRef = collection(db, 'rooms').add(roomWithOffer)
  const roomId = roomRef.id
  currentRoom.value = `Current room is ${roomId} - You are the caller!`

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream)
  })

  // Code for collecting ICE candidates below

  const callerCandidatesCollection = collection(db, 'callerCandidates')

  peerConnection.addEventListener('icecandidate', (event) => {
    if (!event.candidate) {
      console.log('Got final candidate!')
      return
    }
    console.log('Got candidate: ', event.candidate)
    callerCandidatesCollection.add(event.candidate.toJSON())
  })

  // Code for collecting ICE candidates above

  peerConnection.addEventListener('track', (event) => {
    console.log('Got remote track:', event.streams[0])
    event.streams[0].getTracks().forEach((track) => {
      console.log('Add a track to the remoteStream:', track)
      remoteStream.addTrack(track)
    })
  })

  // Listening for remote session description below
  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data()
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer)
      const rtcSessionDescription = new RTCSessionDescription(data.answer)
      await peerConnection.setRemoteDescription(rtcSessionDescription)
    }
  })
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        let data = change.doc.data()
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
        await peerConnection.addIceCandidate(new RTCIceCandidate(data))
      }
    })
  })
  // Listen for remote ICE candidates above
}
const confirmJoinBtn = async () => {
  currentRoom.value = `Current room is ${roomId.value} - You are the callee!`
  await joinRoomById(roomId.value)
}

const joinRoom = () => {
  createBtnDisabled.value = true
  joinBtnDisabled.value = true

  // roomDialog.open()
}

const joinRoomById = async (roomId) => {
  const roomRef = collection(db, 'rooms').doc(`${roomId}`)
  const roomSnapshot = await roomRef.get()
  console.log('Got room:', roomSnapshot.exists)

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration)
    peerConnection = new RTCPeerConnection(configuration)
    registerPeerConnectionListeners()
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream)
    })

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = collection(db, 'calleeCandidates')
    peerConnection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        console.log('Got final candidate!')
        return
      }
      console.log('Got candidate: ', event.candidate)
      calleeCandidatesCollection.add(event.candidate.toJSON())
    })
    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', (event) => {
      console.log('Got remote track:', event.streams[0])
      event.streams[0].getTracks().forEach((track) => {
        console.log('Add a track to the remoteStream:', track)
        remoteStream.addTrack(track)
      })
    })
    // Code for creating SDP answer below

    const offer = roomSnapshot.data().offer
    await peerConnection.setRemoteDescription(offer)
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    }
    await roomRef.update(roomWithAnswer)

    // Code for creating SDP answer above

    // Listening for remote ICE candidates below

    collection(db, 'callerCandidates').onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          let data = change.doc.data()
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
          await peerConnection.addIceCandidate(new RTCIceCandidate(data))
        }
      })
    })

    // Listening for remote ICE candidates above
  }
}

const openUserMedia = async (e) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  })
  localVideo.value.srcObject = stream
  localStream = stream
  remoteStream = new MediaStream()
  remoteVideo.value.srcObject = remoteStream

  console.log('Stream:', localVideo.value.srcObject)
  createBtnDisabled.value = false
  joinBtnDisabled.value = false
  cameraBtnDisabled.value = true
  hangupBtnDisabled.value = false
}

async function hangUp(e) {
  const tracks = localVideo.value.srcObject.getTracks()
  tracks.forEach((track) => {
    track.stop()
  })

  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop())
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
    const roomRef = db.collection('rooms').doc(roomId.value)
    const calleeCandidates = await roomRef.collection('calleeCandidates').get()
    calleeCandidates.forEach(async (candidate) => {
      await candidate.delete()
    })
    const callerCandidates = await roomRef.collection('callerCandidates').get()
    callerCandidates.forEach(async (candidate) => {
      await candidate.delete()
    })
    await roomRef.delete()
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
  })

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    )
  })
}
</script>

<style scoped></style>
