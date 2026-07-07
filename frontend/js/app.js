const ws = new WebSocket("ws://localhost:8081");

function data() {
  return {
    roomId: room.value,
    password: password.value,
    username: username.value
  };
}

function createRoom() {
  ws.send(JSON.stringify({ type: "create-room", ...data() }));
}

function joinRoom() {
  ws.send(JSON.stringify({ type: "join-room", ...data() }));
}

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.error) return alert(msg.error);
  if (msg.type === "room-created") joinRoom();
  if (msg.type === "room-state") {
    sessionStorage.setItem("roomId", room.value);
    sessionStorage.setItem("password", password.value);
    sessionStorage.setItem("username", username.value);
    location.href = "workspace.html";
  }
};
