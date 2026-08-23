import {
    connectWebSocket,
    sendMessage,
    isConnected
} from "./websocket.js";

import {
    initializeWorkspace
} from "./workspace.js";

import {
    initializeDragDrop
} from "./dragdrop.js";

import {
    showToast,
    showLoading,
    hideLoading
} from "./ui.js";

const roomForm = document.getElementById("roomForm");
const usernameInput = document.getElementById("username");
const roomIdInput = document.getElementById("roomId");
const passwordInput = document.getElementById("password");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

let currentUser = {
    userId: "",
    username: "",
    roomId: ""
};

function generateUserId() {
    return "user_" + crypto.randomUUID();
}

function saveSession() {
    sessionStorage.setItem(
        "p2pshare-session",
        JSON.stringify(currentUser)
    );
}

function loadSession() {
    const session = sessionStorage.getItem("p2pshare-session");

    if (!session) return false;

    try {
        currentUser = JSON.parse(session);

        usernameInput.value = currentUser.username;

        return true;
    } catch {
        return false;
    }
}

async function connect() {
    if (isConnected()) return;

    await connectWebSocket();

    sendMessage({
        type: "CONNECT",
        userId: currentUser.userId
    });
}

async function createRoom() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showToast("Fill all required fields.");
        return;
    }

    currentUser.userId = generateUserId();
    currentUser.username = username;

    await connect();

    showLoading("Creating room...");

    sendMessage({
        type: "CREATE_ROOM",
        ownerId: currentUser.userId,
        password
    });
}

async function joinRoom() {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !roomId || !password) {
        showToast("Fill all required fields.");
        return;
    }

    currentUser.userId = generateUserId();
    currentUser.username = username;
    currentUser.roomId = roomId;

    await connect();

    showLoading("Joining room...");

    sendMessage({
        type: "JOIN_ROOM",
        roomId,
        userId: currentUser.userId,
        password
    });
}

window.addEventListener("load", () => {

    loadSession();

    createRoomBtn.addEventListener(
        "click",
        createRoom
    );

    joinRoomBtn.addEventListener(
        "click",
        joinRoom
    );

    initializeWorkspace();
    initializeDragDrop();
});

window.addEventListener("beforeunload", () => {

    if (!currentUser.roomId) return;

    sendMessage({
        type: "LEAVE_ROOM",
        roomId: currentUser.roomId,
        userId: currentUser.userId
    });

    saveSession();
});

export function getCurrentUser() {
    return currentUser;
}

export function setRoom(roomId) {
    currentUser.roomId = roomId;
    saveSession();
}

export function roomCreated(room) {

    hideLoading();

    setRoom(room.roomId);

    showToast("Room created successfully.");

    window.location.href =
        `workspace.html?room=${room.roomId}`;
}

export function roomJoined(room) {

    hideLoading();

    setRoom(room.roomId);

    showToast("Joined successfully.");

    window.location.href =
        `workspace.html?room=${room.roomId}`;
}