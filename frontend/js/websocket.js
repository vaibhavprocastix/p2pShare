const WS_PROTOCOL =
    window.location.protocol === "https:" ? "wss" : "ws";

const WS_URL =
    `${WS_PROTOCOL}://${window.location.hostname}:8081`;

let socket = null;

const listeners = new Map();

let reconnectAttempts = 0;
const MAX_RECONNECTS = 10;
const RECONNECT_DELAY = 3000;

export async function connectWebSocket() {
    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {
        return socket;
    }

    return new Promise((resolve, reject) => {

        socket = new WebSocket(WS_URL);

        socket.onopen = () => {

            console.log("WebSocket Connected");

            reconnectAttempts = 0;

            resolve(socket);
        };

        socket.onmessage = handleMessage;

        socket.onerror = (err) => {

            console.error(err);

            reject(err);
        };

        socket.onclose = () => {

            console.log("WebSocket Closed");

            reconnect();
        };

    });
}

function reconnect() {

    if (reconnectAttempts >= MAX_RECONNECTS)
        return;

    reconnectAttempts++;

    setTimeout(() => {

        connectWebSocket();

    }, RECONNECT_DELAY);
}

function handleMessage(event) {

    let message;

    try {

        message = JSON.parse(event.data);

    } catch {

        console.error("Invalid WS packet");

        return;
    }

    console.log("WS <", message);

    if (listeners.has(message.type)) {

        listeners.get(message.type)
            .forEach(cb => cb(message));
    }

    switch (message.type) {

        case "ROOM_CREATED":

            import("./app.js")
                .then(m => m.roomCreated(message.room));

            break;

        case "ROOM_JOINED":

            import("./app.js")
                .then(m => m.roomJoined(message.room));

            break;

        case "ROOM_KILLED":

            window.location.href = "/";

            break;

        case "ERROR":

            import("./ui.js")
                .then(ui => {

                    ui.hideLoading();

                    ui.showToast(
                        message.message || "Error"
                    );

                });

            break;

        default:

            break;
    }
}

export function sendMessage(payload) {

    if (!socket) {

        console.error("Socket not created");

        return false;
    }

    if (socket.readyState !== WebSocket.OPEN) {

        console.error("Socket closed");

        return false;
    }

    console.log("WS >", payload);

    socket.send(JSON.stringify(payload));

    return true;
}

export function registerListener(
    type,
    callback
) {

    if (!listeners.has(type)) {

        listeners.set(type, []);
    }

    listeners.get(type).push(callback);
}

export function unregisterListener(
    type,
    callback
) {

    if (!listeners.has(type))
        return;

    listeners.set(
        type,
        listeners
            .get(type)
            .filter(cb => cb !== callback)
    );
}

export function closeSocket() {

    if (socket) {

        socket.close();
    }
}

export function getSocket() {

    return socket;
}

export function isConnected() {

    return (
        socket &&
        socket.readyState === WebSocket.OPEN
    );
}