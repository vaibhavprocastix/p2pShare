let pc, dc, socket, file;

window.createRoom = async () => {
  file = document.getElementById("file").files[0];
  const roomId = crypto.randomUUID();
  alert(roomId);

  socket = new WebSocket("ws://localhost:8081");
  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("data");

  pc.onicecandidate = e => e.candidate &&
    socket.send(JSON.stringify({ type: "signal", candidate: e.candidate }));

  socket.onopen = async () => {
    socket.send(JSON.stringify({ type: "create-room", roomId }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "signal", sdp: offer }));
  };

  socket.onmessage = async e => {
    const d = JSON.parse(e.data);
    if (d.sdp) await pc.setRemoteDescription(d.sdp);
  };

  dc.onopen = () => {
    dc.send(file.name);
    file.arrayBuffer().then(b => dc.send(b));
  };
};

window.joinRoom = async () => {
  const roomId = document.getElementById("room").value;
  socket = new WebSocket("ws://localhost:8081");
  pc = new RTCPeerConnection();

  pc.ondatachannel = e => {
    let chunks = [], name;
    e.channel.onmessage = m => {
      if (typeof m.data === "string") name = m.data;
      else {
        chunks.push(m.data);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(chunks));
        a.download = name;
        a.click();
      }
    };
  };

  pc.onicecandidate = e => e.candidate &&
    socket.send(JSON.stringify({ type: "signal", candidate: e.candidate }));

  socket.onopen = () =>
    socket.send(JSON.stringify({ type: "join-room", roomId }));

  socket.onmessage = async e => {
    const d = JSON.parse(e.data);
    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      socket.send(JSON.stringify({ type: "signal", sdp: ans }));
    }
    if (d.candidate) await pc.addIceCandidate(d.candidate);
  };
};
