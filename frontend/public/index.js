// WebSocket URL - update this with your deployed URL for production
const WS_URL = typeof chrome !== 'undefined' && chrome.runtime 
  ? "wss://your-app-name.onrender.com"  // Production URL
  : "ws://localhost:8081";                // Development URL

const ws = new WebSocket(WS_URL);
let pendingAction = null;

// Get DOM elements
const roomIdInput = document.getElementById('roomId');
const passwordInput = document.getElementById('password');
const usernameInput = document.getElementById('username');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const status = document.getElementById('status');

ws.onopen = () => {
  status.textContent = "Connected";
  status.className = "status-msg success";
};

ws.onerror = () => {
  status.textContent = "Connection error. Is the server running?";
  status.className = "status-msg error";
};

function getData() {
  const room = roomIdInput.value.trim();
  const pass = passwordInput.value.trim();
  const user = usernameInput.value.trim();

  if (!room || !pass || !user) {
    status.textContent = "Please fill all fields";
    status.className = "status-msg error";
    return null;
  }

  return { roomId: room, password: pass, username: user };
}

function createRoom() {
  const data = getData();
  if (!data) return;

  pendingAction = "create";
  ws.send(JSON.stringify({ type: "create-room", ...data }));
  status.textContent = "Creating room...";
  status.className = "status-msg";
}

function joinRoom() {
  const data = getData();
  if (!data) return;

  pendingAction = "join";
  ws.send(JSON.stringify({ type: "join-room", ...data }));
  status.textContent = "Joining room...";
  status.className = "status-msg";
}

ws.onmessage = e => {
  const msg = JSON.parse(e.data);

  if (msg.type === "error") {
    status.textContent = msg.error;
    status.className = "status-msg error";
    pendingAction = null;
  }

  if (msg.type === "room-created") {
    // Auto-join after creation
    const data = getData();
    ws.send(JSON.stringify({ type: "join-room", ...data }));
  }

  if (msg.type === "room-state") {
    // Save to session and redirect
    sessionStorage.setItem("roomId", roomIdInput.value);
    sessionStorage.setItem("password", passwordInput.value);
    sessionStorage.setItem("username", usernameInput.value);
    sessionStorage.setItem("userId", msg.userId);
    sessionStorage.setItem("isOwner", msg.isOwner);
    location.href = "workspace.html";
  }
};

// Event listeners
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);

// Enter key support
[roomIdInput, passwordInput, usernameInput].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createRoom();
    }
  });
});