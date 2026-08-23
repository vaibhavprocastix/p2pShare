import { registerListener, sendMessage } from "./websocket.js";
import { getCurrentUser } from "./app.js";

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};

const peers = new Map();
const dataChannels = new Map();

export function initializeWebRTC() {

    registerListener("OFFER", onOffer);
    registerListener("ANSWER", onAnswer);
    registerListener("ICE_CANDIDATE", onIceCandidate);
}

export async function createPeer(remoteUserId) {

    if (peers.has(remoteUserId))
        return peers.get(remoteUserId);

    const pc = new RTCPeerConnection(rtcConfig);

    peers.set(remoteUserId, pc);

    pc.onicecandidate = (event) => {

        if (!event.candidate)
            return;

        sendMessage({
            type: "ICE_CANDIDATE",
            from: getCurrentUser().userId,
            to: remoteUserId,
            candidate: event.candidate
        });

    };

    pc.onconnectionstatechange = () => {

        console.log(
            "Connection:",
            remoteUserId,
            pc.connectionState
        );

        if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed"
        ) {

            closePeer(remoteUserId);

        }

    };

    pc.ondatachannel = (event) => {

        setupDataChannel(
            remoteUserId,
            event.channel
        );

    };

    return pc;
}

export async function connectPeer(remoteUserId) {

    const pc =
        await createPeer(remoteUserId);

    const channel = pc.createDataChannel(
        "file-transfer",
        {
            ordered: true
        }
    );

    setupDataChannel(
        remoteUserId,
        channel
    );

    const offer =
        await pc.createOffer();

    await pc.setLocalDescription(
        offer
    );

    sendMessage({
        type: "OFFER",
        from: getCurrentUser().userId,
        to: remoteUserId,
        offer
    });

}

async function onOffer(message) {

    const pc =
        await createPeer(message.from);

    await pc.setRemoteDescription(
        new RTCSessionDescription(
            message.offer
        )
    );

    const answer =
        await pc.createAnswer();

    await pc.setLocalDescription(
        answer
    );

    sendMessage({
        type: "ANSWER",
        from: getCurrentUser().userId,
        to: message.from,
        answer
    });

}

async function onAnswer(message) {

    const pc =
        peers.get(message.from);

    if (!pc)
        return;

    await pc.setRemoteDescription(
        new RTCSessionDescription(
            message.answer
        )
    );

}

async function onIceCandidate(message) {

    const pc =
        peers.get(message.from);

    if (!pc)
        return;

    try {

        await pc.addIceCandidate(
            new RTCIceCandidate(
                message.candidate
            )
        );

    } catch (err) {

        console.error(err);

    }

}

function setupDataChannel(
    remoteUserId,
    channel
) {

    dataChannels.set(
        remoteUserId,
        channel
    );

    channel.binaryType = "arraybuffer";

    channel.onopen = () => {

        console.log(
            "DataChannel Open:",
            remoteUserId
        );

    };

    channel.onclose = () => {

        console.log(
            "DataChannel Closed:",
            remoteUserId
        );

        dataChannels.delete(
            remoteUserId
        );

    };

    channel.onerror = console.error;

    channel.onmessage = async (event) => {

        const { handleIncomingChunk } =
            await import("./files.js");

        handleIncomingChunk(
            remoteUserId,
            event.data
        );

    };

}

export function getDataChannel(
    remoteUserId
) {

    return dataChannels.get(
        remoteUserId
    );

}

export function getPeer(
    remoteUserId
) {

    return peers.get(
        remoteUserId
    );

}

export function closePeer(
    remoteUserId
) {

    const pc =
        peers.get(remoteUserId);

    if (pc) {

        pc.close();

        peers.delete(remoteUserId);

    }

    dataChannels.delete(
        remoteUserId
    );

}

export function closeAllPeers() {

    for (const id of peers.keys()) {

        closePeer(id);

    }

}