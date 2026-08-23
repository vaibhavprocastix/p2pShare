import {
    registerListener,
    sendMessage
} from "./websocket.js";

import {
    initializeWebRTC,
    connectPeer,
    closeAllPeers
} from "./webrtc.js";

import {
    initializeFileManager,
    renderFileList,
    removeFile,
    updateFileMetadata
} from "./files.js";

import {
    initializeDragDrop
} from "./dragdrop.js";

import {
    updateUserList,
    showToast,
    updateRoomInfo,
    updateConnectionStatus,
    showLoading,
    hideLoading
} from "./ui.js";

import { getCurrentUser } from "./app.js";

let room = null;

export function initializeWorkspace() {

    if (!window.location.pathname.includes("workspace"))
        return;

    initializeWebRTC();
    initializeFileManager();
    initializeDragDrop();

    registerListener("ROOM_STATE", onRoomState);
    registerListener("USER_JOINED", onUserJoined);
    registerListener("USER_LEFT", onUserLeft);

    registerListener("FILE_LIST", onFileList);
    registerListener("FILE_ADDED", onFileAdded);
    registerListener("FILE_REMOVED", onFileRemoved);
    registerListener("FILE_METADATA", onFileMetadata);

    registerListener("ROOM_KILLED", onRoomKilled);

    loadWorkspace();
}

async function loadWorkspace() {

    const roomId =
        new URLSearchParams(
            window.location.search
        ).get("room");

    if (!roomId) {

        window.location.href = "/";

        return;
    }

    showLoading("Loading workspace...");

    sendMessage({
        type: "ROOM_STATE",
        roomId
    });

}

function onRoomState(message) {

    hideLoading();

    room = message.room;

    updateRoomInfo(room);

    renderFileList(room.files);

    updateUserList(room.users);

    updateConnectionStatus(true);

    establishConnections();
}

async function establishConnections() {

    const currentUser =
        getCurrentUser();

    for (const userId of room.users) {

        if (
            userId === currentUser.userId
        )
            continue;

        await connectPeer(userId);

    }

}

function onUserJoined(message) {

    room.users.push(message.userId);

    updateUserList(room.users);

    connectPeer(message.userId);

    showToast("User joined room");

}

function onUserLeft(message) {

    room.users =
        room.users.filter(
            id => id !== message.userId
        );

    updateUserList(room.users);

    showToast("User left room");

}

function onFileList(message) {

    room.files = message.files;

    renderFileList(room.files);

}

function onFileAdded(message) {

    room.files.unshift(message.file);

    renderFileList(room.files);

    showToast("New file received");

}

function onFileRemoved(message) {

    room.files =
        room.files.filter(
            f => f.fileId !== message.fileId
        );

    removeFile(message.fileId);

    showToast("File removed");

}

function onFileMetadata(message) {

    updateFileMetadata(message.file);

}

function onRoomKilled() {

    alert("Room has been closed.");

    closeAllPeers();

    window.location.href = "/";

}

export function refreshWorkspace() {

    if (!room)
        return;

    sendMessage({
        type: "ROOM_STATE",
        roomId: room.roomId
    });

}

export function getWorkspace() {

    return room;

}

window.addEventListener(
    "beforeunload",
    () => {

        if (!room)
            return;

        sendMessage({
            type: "LEAVE_ROOM",
            roomId: room.roomId,
            userId: getCurrentUser().userId
        });

        closeAllPeers();

    }
);