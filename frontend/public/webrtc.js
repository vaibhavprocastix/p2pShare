const CHUNK_SIZE = 256 * 1024;

let pc, dc, socket, file;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/* =======================
   SENDER
======================= */
window.createRoom = async () => {
  file = document.getElementById("file").files[0];
  if (!file) return alert("Select a file first");

  const roomId = crypto.randomUUID();
  alert("Room ID: " + roomId);

  socket = new WebSocket("ws://localhost:8081");
  pc = new RTCPeerConnection(rtcConfig);

  dc = pc.createDataChannel("file");

  dc.onopen = () => {
    console.log("✅ DataChannel OPEN (sender)");
    sendFile();
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "signal", candidate: e.candidate }));
    }
  };

  socket.onmessage = async e => {
    const data = JSON.parse(e.data);

    if (data.type === "peer-joined") {
      console.log("👤 Receiver joined, creating offer");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.send(JSON.stringify({
        type: "signal",
        sdp: offer
      }));
    }

    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
    }

    if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  };

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "create-room",
      roomId
    }));
  };
};

async function sendFile() {
  dc.send(JSON.stringify({
    type: "meta",
    name: file.name,
    size: file.size,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE)
  }));

  let offset = 0;
  let index = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();

    dc.send(JSON.stringify({ type: "chunk", index }));
    dc.send(buffer);

    offset += CHUNK_SIZE;
    index++;
  }

  console.log("✅ File sent");
}

/* =======================
   RECEIVER
======================= */
window.joinRoom = async () => {
  const roomId = document.getElementById("room").value;
  if (!roomId) return alert("Enter Room ID");

  socket = new WebSocket("ws://localhost:8081");
  pc = new RTCPeerConnection(rtcConfig);

  let receivedChunks = [];
  let fileMeta = {};
  let currentIndex = 0;

  pc.ondatachannel = e => {
    console.log("✅ DataChannel received (receiver)");
    const channel = e.channel;

    channel.onmessage = msg => {
      if (typeof msg.data === "string") {
        const data = JSON.parse(msg.data);

        if (data.type === "meta") {
          fileMeta = data;
          receivedChunks = new Array(data.totalChunks);
          console.log("📥 Receiving:", fileMeta.name);
        }

        if (data.type === "chunk") {
          currentIndex = data.index;
        }
      } else {
        receivedChunks[currentIndex] = msg.data;
      }

      if (
        fileMeta.totalChunks &&
        receivedChunks.filter(Boolean).length === fileMeta.totalChunks
      ) {
        const blob = new Blob(receivedChunks);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileMeta.name;
        a.click();

        console.log("✅ File received");
      }
    };
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "signal", candidate: e.candidate }));
    }
  };

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "join-room",
      roomId
    }));
  };

  socket.onmessage = async e => {
    const data = JSON.parse(e.data);

    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify({
        type: "signal",
        sdp: answer
      }));
    }

    if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  };
};
