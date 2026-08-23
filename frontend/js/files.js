import { getDataChannel } from "./webrtc.js";
import {
    sendMessage,
    registerListener
} from "./websocket.js";

import {
    saveChunk,
    loadChunks,
    clearChunks
} from "./indexeddb.js";

import {
    updateTransferProgress,
    showToast
} from "./ui.js";

import {
    calculateChecksum,
    splitFileIntoChunks
} from "./fileUtils.js";

import { getCurrentUser } from "./app.js";

const CHUNK_SIZE = 256 * 1024; //256 KB

const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; //16 MB

const ACK_WINDOW = 64;

const RESEND_TIMEOUT = 5000;

const uploads = new Map();

const downloads = new Map();

const pendingACKs = new Map();

const transferQueue = [];

let sending = false;

export function initializeFileManager() {

    registerListener(
        "DOWNLOAD_REQUEST",
        onDownloadRequest
    );

    registerListener(
        "DOWNLOAD_ACCEPT",
        onDownloadAccepted
    );

    registerListener(
        "DOWNLOAD_REJECT",
        onDownloadRejected
    );

    registerListener(
        "RESUME_REQUEST",
        onResumeRequest
    );

    registerListener(
        "CHUNK_ACK",
        onChunkAcknowledged
    );

    registerListener(
        "DOWNLOAD_COMPLETED",
        onDownloadCompleted
    );

    registerListener(
        "DOWNLOAD_CANCELLED",
        onDownloadCancelled
    );
}

export function registerUpload(file) {

    const upload = {
        fileId: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        checksum: null,
        chunks: [],
        totalChunks: 0,
        uploadedChunks: 0,
        completed: false,
        peerId: null
    };

    uploads.set(upload.fileId, upload);

    return upload;
}

export function getUpload(fileId) {

    return uploads.get(fileId);

}

export function getDownload(downloadId) {

    return downloads.get(downloadId);

}

export function removeUpload(fileId) {

    uploads.delete(fileId);

}

export function removeDownload(downloadId) {

    downloads.delete(downloadId);

}

export function queueTransfer(task) {

    transferQueue.push(task);

    processQueue();

}

async function processQueue() {

    if (sending)
        return;

    sending = true;

    while (transferQueue.length) {

        const task =
            transferQueue.shift();

        try {

            await task();

        } catch (err) {

            console.error(err);

        }

    }

    sending = false;

}

export function getChunkSize() {

    return CHUNK_SIZE;

}

export function getWindowSize() {

    return ACK_WINDOW;

}

export function getBufferedLimit() {

    return MAX_BUFFERED_AMOUNT;

}

export function activeUploads() {

    return [...uploads.values()];

}

export function activeDownloads() {

    return [...downloads.values()];

}

export function isUploading(fileId) {

    return uploads.has(fileId);

}

export function isDownloading(downloadId) {

    return downloads.has(downloadId);

}

export async function uploadFile(file, peerId, roomId) {

    const upload = registerUpload(file);

    upload.peerId = peerId;

    updateTransferProgress(
        upload.fileId,
        0,
        "Preparing..."
    );

    // -----------------------------
    // Generate checksum
    // -----------------------------

    const buffer = await file.arrayBuffer();

    upload.checksum =
        await calculateChecksum(buffer);

    // -----------------------------
    // Split file into chunks
    // -----------------------------

    upload.chunks =
        splitFileIntoChunks(
            file,
            CHUNK_SIZE
        );

    upload.totalChunks =
        upload.chunks.length;

    // -----------------------------
    // Register metadata with server
    // -----------------------------

    sendMessage({

        type: "FILE_METADATA",

        roomId,

        ownerId: getCurrentUser().userId,

        fileName: upload.fileName,

        fileSize: upload.fileSize,

        mimeType: upload.mimeType,

        totalChunks: upload.totalChunks,

        checksum: upload.checksum

    });

    updateTransferProgress(
        upload.fileId,
        1,
        "Waiting for receiver..."
    );

    return upload;
}

export function startUpload(
    fileId,
    peerId
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return;

    queueTransfer(async () => {

        await sendChunks(
            upload,
            peerId
        );

    });

}

export function cancelUpload(
    fileId
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return;

    sendMessage({

        type: "DOWNLOAD_CANCELLED",

        fileId

    });

    uploads.delete(fileId);

    pendingACKs.delete(fileId);

}

export async function retryUpload(
    fileId
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return;

    upload.uploadedChunks = 0;

    pendingACKs.delete(fileId);

    await startUpload(
        fileId,
        upload.peerId
    );

}

export function getUploadProgress(
    fileId
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return 0;

    return Math.floor(

        upload.uploadedChunks /
        upload.totalChunks * 100

    );

}

export function markChunkUploaded(
    fileId,
    chunkIndex
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return;

    upload.uploadedChunks++;

    updateTransferProgress(

        fileId,

        getUploadProgress(fileId),

        `${upload.uploadedChunks}/${upload.totalChunks}`

    );

}

export function finishUpload(
    fileId
) {

    const upload =
        uploads.get(fileId);

    if (!upload)
        return;

    upload.completed = true;

    updateTransferProgress(

        fileId,

        100,

        "Completed"

    );

    sendMessage({

        type: "DOWNLOAD_COMPLETED",

        fileId

    });

}

function onDownloadRequest(message) {

    const {
        downloadId,
        from,
        file
    } = message;

    const accepted = confirm(
        `${from} wants to send "${file.fileName}" (${(
            file.fileSize / 1024 / 1024
        ).toFixed(2)} MB).\n\nAccept download?`
    );

    if (!accepted) {

        sendMessage({
            type: "DOWNLOAD_REJECT",
            downloadId,
            receiverId: getCurrentUser().userId
        });

        return;
    }

    const download = {
        downloadId,
        senderId: from,
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        checksum: file.checksum,
        totalChunks: file.totalChunks,
        receivedChunks: 0,
        chunks: new Array(file.totalChunks),
        completed: false,
        startedAt: Date.now()
    };

    downloads.set(downloadId, download);

    updateTransferProgress(
        downloadId,
        0,
        "Waiting for chunks..."
    );

    sendMessage({
        type: "DOWNLOAD_ACCEPT",
        downloadId,
        senderId: from,
        receiverId: getCurrentUser().userId
    });
}

function onDownloadAccepted(message) {

    const upload =
        [...uploads.values()].find(
            u => u.peerId === message.receiverId
        );

    if (!upload)
        return;

    startUpload(
        upload.fileId,
        message.receiverId
    );
}

function onDownloadRejected(message) {

    const upload =
        [...uploads.values()].find(
            u => u.fileId === message.fileId
        );

    if (!upload)
        return;

    showToast("Receiver declined download.");

    removeUpload(upload.fileId);
}

function onDownloadCompleted(message) {

    const download =
        downloads.get(message.downloadId);

    if (!download)
        return;

    finalizeDownload(download);
}

function onDownloadCancelled(message) {

    downloads.delete(message.downloadId);

    updateTransferProgress(
        message.downloadId,
        0,
        "Cancelled"
    );

    showToast("Transfer cancelled.");
}

async function finalizeDownload(download) {

    const blob = new Blob(download.chunks, {
        type: download.mimeType
    });

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;
    a.download = download.fileName;

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

    await clearChunks(download.downloadId);

    download.completed = true;

    updateTransferProgress(
        download.downloadId,
        100,
        "Completed"
    );

    showToast("Download completed.");

    downloads.delete(download.downloadId);
}

async function sendChunks(upload, peerId) {

    const channel = getDataChannel(peerId);

    if (!channel) {
        throw new Error("DataChannel not available.");
    }

    if (channel.readyState !== "open") {
        throw new Error("DataChannel is not open.");
    }

    pendingACKs.set(upload.fileId, new Map());

    let base = 0;
    let nextChunk = 0;

    while (base < upload.totalChunks) {

        while (
            nextChunk < upload.totalChunks &&
            nextChunk < base + ACK_WINDOW
        ) {

            await waitForBuffer(channel);

            await sendSingleChunk(
                channel,
                upload,
                nextChunk
            );

            pendingACKs
                .get(upload.fileId)
                .set(
                    nextChunk,
                    Date.now()
                );

            nextChunk++;
        }

        base = await waitForAcknowledgements(
            upload.fileId,
            base,
            nextChunk,
            channel,
            upload
        );

        updateTransferProgress(
            upload.fileId,
            Math.floor(
                (base / upload.totalChunks) * 100
            ),
            `${base}/${upload.totalChunks}`
        );
    }

    finishUpload(upload.fileId);
}

async function sendSingleChunk(
    channel,
    upload,
    chunkIndex
) {

    const blob = upload.chunks[chunkIndex];

    const buffer =
        await blob.arrayBuffer();

    const packet = {
        type: "CHUNK",
        fileId: upload.fileId,
        index: chunkIndex,
        total: upload.totalChunks,
        payload: Array.from(
            new Uint8Array(buffer)
        )
    };

    channel.send(
        JSON.stringify(packet)
    );
}

async function waitForBuffer(
    channel
) {

    while (
        channel.bufferedAmount >
        MAX_BUFFERED_AMOUNT
    ) {

        await sleep(10);

    }

}

async function waitForAcknowledgements(
    fileId,
    base,
    nextChunk,
    channel,
    upload
) {

    while (true) {

        const ackMap =
            pendingACKs.get(fileId);

        while (
            ackMap &&
            !ackMap.has(base)
        ) {

            base++;

            if (base >= nextChunk)
                return base;
        }

        const now = Date.now();

        for (const [
            index,
            sentTime
        ] of ackMap.entries()) {

            if (
                now - sentTime >
                RESEND_TIMEOUT
            ) {

                await resendChunk(
                    channel,
                    upload,
                    index
                );

                ackMap.set(
                    index,
                    Date.now()
                );

            }

        }

        await sleep(20);

    }

}

async function resendChunk(
    channel,
    upload,
    index
) {

    console.log(
        "Resending chunk",
        index
    );

    await sendSingleChunk(
        channel,
        upload,
        index
    );

}

function onChunkAcknowledged(
    message
) {

    const ackMap =
        pendingACKs.get(
            message.fileId
        );

    if (!ackMap)
        return;

    ackMap.delete(
        message.chunkIndex
    );

    markChunkUploaded(
        message.fileId,
        message.chunkIndex
    );

}

function sleep(ms) {

    return new Promise(resolve => {

        setTimeout(
            resolve,
            ms
        );

    });

}

export async function handleIncomingChunk(
    remoteUserId,
    rawData
) {

    let packet;

    try {

        packet =
            typeof rawData === "string"
                ? JSON.parse(rawData)
                : JSON.parse(
                    new TextDecoder().decode(rawData)
                );

    } catch (err) {

        console.error("Invalid chunk", err);

        return;

    }

    if (packet.type !== "CHUNK")
        return;

    const download =
        [...downloads.values()].find(
            d => d.fileId === packet.fileId
        );

    if (!download)
        return;

    const bytes =
        new Uint8Array(packet.payload);

    download.chunks[packet.index] =
        bytes;

    download.receivedChunks++;

    await saveChunk(
        download.downloadId,
        packet.index,
        bytes
    );

    updateTransferProgress(

        download.downloadId,

        Math.floor(
            (
                download.receivedChunks /
                download.totalChunks
            ) * 100
        ),

        `${download.receivedChunks}/${download.totalChunks}`

    );

    sendChunkAck(

        remoteUserId,

        packet.fileId,

        packet.index

    );

    if (
        download.receivedChunks ===
        download.totalChunks
    ) {

        await verifyDownload(download);

    }

}

function sendChunkAck(
    peerId,
    fileId,
    chunkIndex
) {

    sendMessage({

        type: "CHUNK_ACK",

        to: peerId,

        from: getCurrentUser().userId,

        fileId,

        chunkIndex

    });

}

async function verifyDownload(
    download
) {

    const storedChunks =
        await loadChunks(
            download.downloadId
        );

    if (
        storedChunks.length !==
        download.totalChunks
    ) {

        console.warn(
            "Missing chunks detected."
        );

        requestResume(download);

        return;

    }

    finalizeDownload(download);

}

function requestResume(
    download
) {

    const missing = [];

    for (
        let i = 0;
        i < download.totalChunks;
        i++
    ) {

        if (
            !download.chunks[i]
        ) {

            missing.push(i);

        }

    }

    sendMessage({

        type: "RESUME_REQUEST",

        downloadId:
            download.downloadId,

        receiverId:
            getCurrentUser().userId,

        missingChunks: missing

    });

}

function onResumeRequest(
    message
) {

    const upload =
        [...uploads.values()].find(
            u =>
                u.fileId ===
                message.fileId
        );

    if (!upload)
        return;

    queueTransfer(async () => {

        const channel =
            getDataChannel(
                upload.peerId
            );

        if (!channel)
            return;

        for (
            const chunk of
            message.missingChunks
        ) {

            await waitForBuffer(
                channel
            );

            await sendSingleChunk(

                channel,

                upload,

                chunk

            );

        }

    });

}

// =====================================================
// ACK Recovery & Cleanup
// =====================================================

const completedTransfers = new Set();

const transferTimers = new Map();

export function beginTransferWatch(downloadId) {

    clearTransferWatch(downloadId);

    const timer = setTimeout(() => {

        console.warn(
            "Transfer timeout:",
            downloadId
        );

        const download =
            downloads.get(downloadId);

        if (download) {

            requestResume(download);

        }

    }, 30000);

    transferTimers.set(
        downloadId,
        timer
    );

}

export function refreshTransferWatch(
    downloadId
) {

    if (
        !downloads.has(downloadId)
    )
        return;

    beginTransferWatch(
        downloadId
    );

}

export function clearTransferWatch(
    downloadId
) {

    const timer =
        transferTimers.get(
            downloadId
        );

    if (timer) {

        clearTimeout(timer);

        transferTimers.delete(
            downloadId
        );

    }

}

export function cleanupTransfer(
    downloadId
) {

    clearTransferWatch(
        downloadId
    );

    downloads.delete(
        downloadId
    );

    pendingACKs.delete(
        downloadId
    );

    completedTransfers.add(
        downloadId
    );

}

export function isTransferCompleted(
    downloadId
) {

    return completedTransfers.has(
        downloadId
    );

}

// =====================================================
// ACK Utilities
// =====================================================

function removeAcknowledgedChunks(
    fileId,
    uptoChunk
) {

    const ackMap =
        pendingACKs.get(fileId);

    if (!ackMap)
        return;

    for (const chunk of ackMap.keys()) {

        if (chunk <= uptoChunk) {

            ackMap.delete(chunk);

        }

    }

}

function oldestPendingChunk(
    fileId
) {

    const ackMap =
        pendingACKs.get(fileId);

    if (!ackMap)
        return null;

    if (ackMap.size === 0)
        return null;

    return Math.min(
        ...ackMap.keys()
    );

}

export function pendingChunkCount(
    fileId
) {

    const ackMap =
        pendingACKs.get(fileId);

    if (!ackMap)
        return 0;

    return ackMap.size;

}

// =====================================================
// Statistics
// =====================================================

export function getTransferStats() {

    return {

        uploads:
            uploads.size,

        downloads:
            downloads.size,

        queued:
            transferQueue.length,

        completed:
            completedTransfers.size

    };

}

// =====================================================
// Retry Logic
// =====================================================

export async function retryMissingChunks(
    upload,
    chunkIndexes
) {

    const channel =
        getDataChannel(
            upload.peerId
        );

    if (!channel)
        return;

    for (const index of chunkIndexes) {

        await waitForBuffer(
            channel
        );

        await resendChunk(
            channel,
            upload,
            index
        );

    }

}

// =====================================================
// Shutdown
// =====================================================

export async function shutdownTransfers() {

    for (
        const id of
        transferTimers.keys()
    ) {

        clearTransferWatch(id);

    }

    uploads.clear();

    downloads.clear();

    pendingACKs.clear();

    transferQueue.length = 0;

    completedTransfers.clear();

}