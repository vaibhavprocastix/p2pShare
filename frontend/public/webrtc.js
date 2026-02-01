// Check session
if (!sessionStorage.roomId || !sessionStorage.password || !sessionStorage.username) {
  location.href = "index.html";
}

// Use localhost for WebSocket connection (works in extension context)
// For production, replace with your deployed WebSocket URL
const WS_URL = process.env.NODE_ENV === 'production' 
  ? "wss://your-app-name.onrender.com" 
  : "ws://localhost:8081";
const ws = new WebSocket(WS_URL);
const peers = new Map(); // peerId -> RTCPeerConnection
const localFiles = new Map(); // fileId -> File object
const fileMetadata = new Map(); // fileId -> {id, name, ownerId}
const onlineUsers = new Set(); // Track online userIds
let myId;
let isOwner = false;

// UI Elements
const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const fileGrid = document.getElementById("fileGrid");
const emptyState = document.getElementById("emptyState");
const killBtn = document.getElementById("killBtn");
const leaveBtn = document.getElementById("leaveBtn");

// Display room info
roomIdDisplay.textContent = sessionStorage.roomId;
passDisplay.textContent = "••••••••";
hostDisplay.textContent = "Loading...";

// Event listeners for buttons
killBtn.addEventListener('click', killRoom);
leaveBtn.addEventListener('click', leaveRoom);

// WebSocket connection
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "join-room",
    roomId: sessionStorage.roomId,
    password: sessionStorage.password,
    username: sessionStorage.username
  }));
};

ws.onmessage = e => {
  const msg = JSON.parse(e.data);

  if (msg.type === "room-state") {
    myId = msg.userId;
    isOwner = msg.isOwner;
    userCount.textContent = msg.userCount || 1;
    hostDisplay.textContent = msg.ownerName || sessionStorage.username;
    
    if (isOwner) {
      killBtn.style.display = "block";
    }

    // Clear existing UI before loading files
    fileGrid.innerHTML = "";
    
    // Load existing files
    if (msg.files && msg.files.length > 0) {
      msg.files.forEach(file => addFileToUI(file));
      emptyState.style.display = "none";
    } else {
      emptyState.style.display = "block";
    }
  }

  if (msg.type === "file-added") {
    addFileToUI(msg.file);
  }

  if (msg.type === "file-removed") {
    removeFileFromUI(msg.fileId);
  }

  if (msg.type === "user-joined") {
    userCount.textContent = msg.userCount;
  }

  if (msg.type === "user-left") {
    userCount.textContent = msg.userCount;
    onlineUsers.delete(msg.userId);
    // Close any peer connections with this user
    if (peers.has(msg.userId)) {
      peers.get(msg.userId).close();
      peers.delete(msg.userId);
    }
  }

  if (msg.type === "room-killed") {
    alert("Room has been destroyed by the owner");
    // Clear all local data
    localFiles.clear();
    fileMetadata.clear();
    peers.forEach(pc => pc.close());
    peers.clear();
    onlineUsers.clear();
    sessionStorage.clear();
    location.href = "index.html";
  }

  if (msg.type === "signal") {
    handleSignal(msg);
  }
};

ws.onerror = () => {
  alert("Connection error. Please try again.");
  location.href = "index.html";
};

// File upload handlers
uploadBox.addEventListener("click", () => fileInput.click());

uploadBox.addEventListener("dragover", e => {
  e.preventDefault();
  uploadBox.classList.add("drag");
});

uploadBox.addEventListener("dragleave", () => {
  uploadBox.classList.remove("drag");
});

uploadBox.addEventListener("drop", e => {
  e.preventDefault();
  uploadBox.classList.remove("drag");
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", e => {
  handleFiles(e.target.files);
  fileInput.value = ""; // Reset
});

function handleFiles(files) {
  Array.from(files).forEach(file => {
    const fileId = crypto.randomUUID();
    localFiles.set(fileId, file);

    ws.send(JSON.stringify({
      type: "add-file",
      fileId: fileId,
      name: file.name,
      size: file.size,
      fileType: file.type
    }));
  });
}

function addFileToUI(file) {
  emptyState.style.display = "none";
  
  // Store file metadata for downloads
  fileMetadata.set(file.id, file);

  const card = document.createElement("div");
  card.className = "file-card";
  card.dataset.fileId = file.id;

  const date = new Date(file.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isMyFile = file.ownerId === myId;

  card.innerHTML = `
    <div class="file-meta">${file.ownerName} · ${timeStr}</div>
    <div class="file-preview glass">
      <div class="file-icon">${getFileIcon(file.type)}</div>
    </div>
    <div class="file-name">${file.name}</div>
    <div class="file-size">${formatSize(file.size)}</div>
    <div class="file-actions">
      ${isMyFile ? 
        `<button class="btn-small delete-btn" data-action="delete" data-file-id="${file.id}">Delete</button>` :
        `<button class="btn-small download-btn" data-action="download" data-file-id="${file.id}" data-owner-id="${file.ownerId}">Download</button>`
      }
    </div>
  `;

  // Add event listener to the button
  const button = card.querySelector('button');
  button.addEventListener('click', function() {
    const action = this.dataset.action;
    const fileId = this.dataset.fileId;
    const ownerId = this.dataset.ownerId;
    
    if (action === 'delete') {
      removeFile(fileId);
    } else if (action === 'download') {
      downloadFile(fileId, ownerId);
    }
  });

  // Insert at the beginning (newest first)
  fileGrid.insertBefore(card, fileGrid.firstChild);
}

function removeFileFromUI(fileId) {
  const card = document.querySelector(`[data-file-id="${fileId}"]`);
  if (card) {
    card.remove();
    localFiles.delete(fileId);
  }

  if (fileGrid.children.length === 0) {
    emptyState.style.display = "block";
  }
}

function removeFile(fileId) {
  ws.send(JSON.stringify({
    type: "remove-file",
    fileId
  }));
}

window.downloadFile = function(fileId, ownerId) {
  if (ownerId === myId) {
    // Download own file directly
    const file = localFiles.get(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    return;
  }

  // Request file from peer
  ws.send(JSON.stringify({
    type: "signal",
    action: "request",
    target: ownerId,
    fileId
  }));
};

// WebRTC Signal Handling
function handleSignal(msg) {
  if (msg.action === "request") {
    // Someone wants to download our file
    const fileId = msg.fileId;
    const file = localFiles.get(fileId);
    
    if (!file) {
      console.error("File not found:", fileId);
      // Send error back to requester
      ws.send(JSON.stringify({
        type: "signal",
        action: "error",
        target: msg.from,
        error: "File not available"
      }));
      return;
    }

    const pc = createPeerConnection(msg.from);
    const dc = pc.createDataChannel("file");

    dc.onopen = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const chunkSize = 16384; // 16KB chunks
        
        // Send metadata first
        const metadata = JSON.stringify({
          type: "metadata",
          name: file.name,
          size: file.size,
          mimeType: file.type
        });
        dc.send(metadata);

        // Send file in chunks
        for (let offset = 0; offset < arrayBuffer.byteLength; offset += chunkSize) {
          const chunk = arrayBuffer.slice(offset, offset + chunkSize);
          dc.send(chunk);
        }

        // Send completion signal
        dc.send(JSON.stringify({ type: "complete" }));
        
        setTimeout(() => {
          pc.close();
          peers.delete(msg.from);
        }, 1000);
      } catch (err) {
        console.error("Error sending file:", err);
      }
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        ws.send(JSON.stringify({
          type: "signal",
          target: msg.from,
          candidate: e.candidate
        }));
      }
    };

    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: "signal",
        target: msg.from,
        sdp: offer
      }));
    });
  }

  if (msg.action === "error") {
    showNotification(msg.error || "Can't download file. Sender not online.", "error");
    return;
  }

  if (msg.sdp) {
    let pc = peers.get(msg.from);

    if (!pc) {
      pc = createPeerConnection(msg.from);
    }

    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() => {
      if (msg.sdp.type === "offer") {
        // Set up data channel for receiving
        pc.ondatachannel = e => {
          const dc = e.channel;
          let receivedData = [];
          let metadata = null;

          dc.onmessage = event => {
            if (typeof event.data === "string") {
              try {
                const parsed = JSON.parse(event.data);
                if (parsed.type === "metadata") {
                  metadata = parsed;
                } else if (parsed.type === "complete") {
                  // Download complete
                  if (metadata && receivedData.length > 0) {
                    const blob = new Blob(receivedData, { type: metadata.mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = metadata.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showNotification("File downloaded successfully!", "success");
                  }
                }
              } catch (e) {
                console.error("Error parsing message:", e);
              }
            } else {
              // File chunk
              receivedData.push(event.data);
            }
          };

          dc.onerror = err => {
            console.error("Data channel error:", err);
            showNotification("Download failed", "error");
          };
        };

        pc.createAnswer().then(answer => {
          pc.setLocalDescription(answer);
          ws.send(JSON.stringify({
            type: "signal",
            target: msg.from,
            sdp: answer
          }));
        });
      }
    });
  }

  if (msg.candidate) {
    const pc = peers.get(msg.from);
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  }
}

// Notification system
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `status-msg ${type}`;
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.top = "20px";
  notification.style.right = "20px";
  notification.style.zIndex = "10000";
  notification.style.minWidth = "250px";
  notification.style.animation = "slideIn 0.3s ease-out";
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(400px)";
    notification.style.transition = "all 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peers.set(peerId, pc);

  pc.onicecandidate = e => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "signal",
        target: peerId,
        candidate: e.candidate
      }));
    }
  };

  return pc;
}

// Helper functions
function getFileIcon(mimeType) {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎥";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦";
  if (mimeType.includes("text")) return "📝";
  return "📄";
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function killRoom() {
  if (confirm("Are you sure you want to destroy this room? All users will be disconnected.")) {
    ws.send(JSON.stringify({ type: "kill-room" }));
  }
}

function leaveRoom() {
  // Clear all local data before leaving
  localFiles.clear();
  fileMetadata.clear();
  peers.forEach(pc => pc.close());
  peers.clear();
  onlineUsers.clear();
  sessionStorage.clear();
  ws.close();
  location.href = "index.html";
}