const ws = new WebSocket("ws://localhost:8081");

const roomId = sessionStorage.getItem("roomId");
const password = sessionStorage.getItem("password");
const username = sessionStorage.getItem("username");

const peers = {};
const localFiles = {};
let myUserId;

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "join-room",
    roomId,
    password,
    username
  }));
};

ws.onmessage = async e => {
  const msg = JSON.parse(e.data);

  if (msg.type === "room-state") {
    myUserId = msg.userId;
    msg.files.forEach(addFileUI);
    if (msg.isOwner)
      document.getElementById("killBtn").hidden = false;
  }

  if (msg.type === "file-added") addFileUI(msg.file);
  if (msg.type === "file-removed")
    document.getElementById(msg.fileId)?.remove();

  if (msg.type === "room-killed") {
    alert("Room closed");
    location.href = "index.html";
  }

  if (msg.type === "signal") handleSignal(msg);
};

window.upload = () => {
  const file = document.getElementById("file").files[0];
  if (!file) return;

  const fileId = crypto.randomUUID();
  localFiles[fileId] = file;

  ws.send(JSON.stringify({
    type: "add-file",
    name: file.name,
    ownerId: myUserId,
    ownerName: username
  }));
};

function addFileUI(file) {
  const card = document.createElement("div");
  card.className = "file-card";
  card.id = file.id;

  const time = new Date(file.ts).toLocaleTimeString();

  card.innerHTML = `
    <div class="file-meta">By ${file.ownerName} at ${time}</div>
    <div class="file-preview"></div>
    <div class="file-name">${file.name}</div>
    <button onclick="download(${JSON.stringify(file).replace(/"/g,'&quot;')})">
      Download
    </button>
  `;

  document.getElementById("files").prepend(card);
}


function download(file) {
  if (file.ownerId === myUserId) return alert("You own this file");
  ws.send(JSON.stringify({
    type: "signal",
    roomId,
    action: "request-file",
    target: file.ownerId,
    fileId: file.id
  }));
}

function handleSignal(msg) {
  if (msg.action === "request-file") {
    sendFile(msg.target, msg.fileId);
  }
}

/* Simplified streaming (safe, not turbo) */
async function sendFile(peerId, fileId) {
  const file = localFiles[fileId];
  if (!file) return alert("Sender offline");

  const pc = new RTCPeerConnection();
  const dc = pc.createDataChannel("file");

  dc.onopen = async () => {
    dc.send(JSON.stringify({ name: file.name, size: file.size }));
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + 64 * 1024);
      dc.send(await chunk.arrayBuffer());
      offset += 64 * 1024;
      await new Promise(r => setTimeout(r, 0));
    }
    pc.close();
  };
}

window.killRoom = () => {
  ws.send(JSON.stringify({ type: "kill-room" }));
};
