/**
 * webrtc.js
 * ------------------------------------------------------------------
 * Owns the full-mesh WebRTC layer:
 *   - one RTCPeerConnection + one RTCDataChannel per remote peer
 *   - SDP offer/answer + ICE candidate exchange (via an injected `signal`
 *     function so this module never imports the signaling client directly)
 *   - a SHARED, ON-DEMAND file model:
 *       shareFile()      -> register a local File as available to the room
 *                            (kept only in this browser's memory)
 *       requestDownload()-> ask a specific uploader peer to stream one
 *                            specific file to us, over the existing
 *                            RTCDataChannel — nothing transfers until this
 *                            is called (i.e. until the user clicks Download)
 *       unshareFile()    -> forget a locally-shared file (after Delete)
 *   - chunked (64KB) transfer with strict backpressure flow control
 *     (1MB high-water pause / 256KB low-water resume) so multi-gigabyte
 *     files never balloon browser memory
 *   - receiver-side chunk accumulation, Blob assembly, and auto-download
 *     once a *requested* transfer completes
 * ------------------------------------------------------------------
 */
import { CONFIG } from '../config.js';

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of an ArrayBuffer, hex-encoded. Used for the optional file integrity check. */
async function sha256Hex(arrayBuffer) {
  const digest = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
  return bufferToHex(digest);
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Wraps a single RTCPeerConnection + RTCDataChannel to one remote peer,
 * plus that peer's outgoing send queue and receive-in-progress state.
 */
class PeerLink {
  constructor(peerId, peerName, isInitiator, mesh) {
    this.peerId = peerId;
    this.peerName = peerName;
    this.isInitiator = isInitiator;
    this.mesh = mesh; // back-reference to MeshManager for callbacks + signaling + local file lookup
    this.pc = new RTCPeerConnection({ iceServers: mesh.iceServers });
    this.dc = null;
    this.connectionState = 'connecting';

    this._sendQueue = []; // [{ file, fileId }] waiting to be streamed to this peer
    this._sending = false;
    this._pausedResolvers = []; // resolve fns waiting on bufferedamountlow

    this._incoming = null; // { fileId, fileName, fileSize, mimeType, chunks[], receivedBytes, ... }
    this._pendingIce = [];
    this._restarted = false;

    this._wireConnectionEvents();

    if (isInitiator) {
      this.dc = this.pc.createDataChannel(CONFIG.DATA_CHANNEL_LABEL, { ordered: true });
      this._wireDataChannel();
    } else {
      this.pc.ondatachannel = (evt) => {
        this.dc = evt.channel;
        this._wireDataChannel();
      };
    }
  }

  _wireConnectionEvents() {
    this.pc.onicecandidate = (evt) => {
      if (evt.candidate) this.mesh.signal(this.peerId, 'ICE_CANDIDATE', { candidate: evt.candidate });
    };

    this.pc.onconnectionstatechange = () => {
      this.connectionState = this.pc.connectionState;
      this.mesh.opts.onPeerState(this.peerId, this.connectionState);
      if (this.connectionState === 'failed') this._attemptIceRestart();
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'failed') this._attemptIceRestart();
    };
  }

  async _attemptIceRestart() {
    if (!this.isInitiator || this._restarted) return;
    this._restarted = true;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.mesh.signal(this.peerId, 'SDP_OFFER', { sdp: this.pc.localDescription });
    } catch (err) {
      console.error('[webrtc] ICE restart failed', err);
    }
  }

  _wireDataChannel() {
    this.dc.binaryType = 'arraybuffer';
    this.dc.bufferedAmountLowThreshold = CONFIG.BUFFERED_AMOUNT_LOW_WATER;

    this.dc.onopen = () => {
      this.mesh.opts.onPeerState(this.peerId, 'channel-open');
      this._pumpSendQueue();
    };
    this.dc.onclose = () => this.mesh.opts.onPeerState(this.peerId, 'channel-closed');
    this.dc.onerror = (evt) => console.error('[webrtc] data channel error', this.peerId, evt);

    this.dc.onbufferedamountlow = () => {
      const resolvers = this._pausedResolvers;
      this._pausedResolvers = [];
      resolvers.forEach((resolve) => resolve());
    };

    this.dc.onmessage = (evt) => this._handleIncomingMessage(evt.data);
  }

  _sendControl(obj) {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(obj));
  }

  // ---- Requesting a download from this peer (they own the file) ---------
  /** Ask this peer (the uploader) to start streaming `fileId` to us. */
  requestFile(fileId) {
    this._sendControl({ kind: 'request', fileId });
  }

  // ---- Serving a file we own, to this peer, on request ------------------
  /** Queue one of OUR shared files to stream to this peer. Keeps the given fileId end-to-end. */
  enqueueFile(file, fileId) {
    this._sendQueue.push({ file, fileId });
    if (this.dc && this.dc.readyState === 'open') this._pumpSendQueue();
  }

  async _pumpSendQueue() {
    if (this._sending) return;
    this._sending = true;
    while (this._sendQueue.length > 0) {
      const { file, fileId } = this._sendQueue.shift();
      try {
        await this._sendFile(file, fileId);
      } catch (err) {
        console.error('[webrtc] file send failed', err);
        this.mesh.opts.onTransferUpdate({
          direction: 'out',
          transferId: `${fileId}:${this.peerId}`,
          peerId: this.peerId,
          peerName: this.peerName,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          bytesTransferred: 0,
          status: 'error',
          error: err.message || String(err),
        });
      }
    }
    this._sending = false;
  }

  async _sendFile(file, fileId) {
    const totalChunks = Math.max(1, Math.ceil(file.size / CONFIG.CHUNK_SIZE));
    const transferId = `${fileId}:${this.peerId}`;

    // Every chunk is already encrypted + integrity-protected in transit by mandatory
    // WebRTC DTLS. This SHA-256 is an extra, user-visible guarantee ("Verified") for
    // files small enough to hash cheaply client-side — see CONFIG.INTEGRITY_CHECK_MAX_BYTES.
    let sha256 = null;
    if (file.size > 0 && file.size <= CONFIG.INTEGRITY_CHECK_MAX_BYTES) {
      try {
        sha256 = await sha256Hex(await file.arrayBuffer());
      } catch (err) {
        console.warn('[webrtc] pre-send hashing failed, continuing without integrity check', err);
      }
    }

    this._sendControl({
      kind: 'meta',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      sha256,
    });

    this.mesh.opts.onTransferUpdate({
      direction: 'out',
      transferId,
      peerId: this.peerId,
      peerName: this.peerName,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      bytesTransferred: 0,
      speedBps: 0,
      status: 'active',
    });

    let offset = 0;
    const startTime = performance.now();
    let lastEmit = startTime;
    let bytesAtLastEmit = 0;

    while (offset < file.size) {
      if (this.dc.bufferedAmount > CONFIG.BUFFERED_AMOUNT_HIGH_WATER) {
        await new Promise((resolve) => this._pausedResolvers.push(resolve));
      }
      if (this.dc.readyState !== 'open') throw new Error('Data channel closed mid-transfer');

      const slice = file.slice(offset, offset + CONFIG.CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      this.dc.send(buffer);
      offset += buffer.byteLength;

      const now = performance.now();
      if (now - lastEmit >= CONFIG.PROGRESS_EMIT_INTERVAL_MS || offset >= file.size) {
        const elapsedSec = (now - lastEmit) / 1000;
        const speedBps = elapsedSec > 0 ? (offset - bytesAtLastEmit) / elapsedSec : 0;
        this.mesh.opts.onTransferUpdate({
          direction: 'out',
          transferId,
          peerId: this.peerId,
          peerName: this.peerName,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          bytesTransferred: offset,
          speedBps,
          status: 'active',
        });
        lastEmit = now;
        bytesAtLastEmit = offset;
      }
    }

    this._sendControl({ kind: 'eof', fileId });

    const totalElapsedSec = (performance.now() - startTime) / 1000;
    this.mesh.opts.onTransferUpdate({
      direction: 'out',
      transferId,
      peerId: this.peerId,
      peerName: this.peerName,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      bytesTransferred: file.size,
      speedBps: totalElapsedSec > 0 ? file.size / totalElapsedSec : 0,
      status: 'done',
    });
  }

  // ---- Inbound ------------------------------------------------------
  _handleIncomingMessage(data) {
    if (typeof data === 'string') {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        console.warn('[webrtc] non-JSON control frame received, ignoring');
        return;
      }
      switch (msg.kind) {
        case 'meta':
          return this._onIncomingMeta(msg);
        case 'eof':
          return this._onIncomingEof(msg);
        case 'request':
          return this._onFileRequested(msg);
        case 'unavailable':
          return this._onFileUnavailable(msg);
        default:
          return;
      }
    }
    this._onIncomingChunk(data);
  }

  /** Someone is asking us for a file we shared — serve it if we still have it. */
  _onFileRequested(msg) {
    const file = this.mesh.localFiles.get(msg.fileId);
    if (!file) {
      this._sendControl({ kind: 'unavailable', fileId: msg.fileId });
      return;
    }
    this.enqueueFile(file, msg.fileId);
  }

  _onFileUnavailable(msg) {
    this.mesh.opts.onTransferUpdate({
      direction: 'in',
      transferId: `${msg.fileId}:${this.peerId}`,
      peerId: this.peerId,
      peerName: this.peerName,
      fileId: msg.fileId,
      fileName: this._incoming?.fileName || 'file',
      fileSize: this._incoming?.fileSize || 0,
      bytesTransferred: 0,
      status: 'error',
      error: 'This file is no longer available from the uploader.',
    });
    if (this._incoming && this._incoming.fileId === msg.fileId) this._incoming = null;
  }

  _onIncomingMeta(meta) {
    this._incoming = {
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType || 'application/octet-stream',
      expectedSha256: meta.sha256 || null,
      chunks: [],
      receivedBytes: 0,
      startTime: performance.now(),
      lastEmit: performance.now(),
      bytesAtLastEmit: 0,
    };

    this.mesh.opts.onTransferUpdate({
      direction: 'in',
      transferId: `${meta.fileId}:${this.peerId}`,
      peerId: this.peerId,
      peerName: this.peerName,
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      bytesTransferred: 0,
      speedBps: 0,
      status: 'active',
    });
  }

  _onIncomingChunk(buffer) {
    const inc = this._incoming;
    if (!inc) {
      console.warn('[webrtc] received chunk with no active metadata header, dropping');
      return;
    }
    inc.chunks.push(buffer);
    inc.receivedBytes += buffer.byteLength;

    const now = performance.now();
    if (now - inc.lastEmit >= CONFIG.PROGRESS_EMIT_INTERVAL_MS || inc.receivedBytes >= inc.fileSize) {
      const elapsedSec = (now - inc.lastEmit) / 1000;
      const speedBps = elapsedSec > 0 ? (inc.receivedBytes - inc.bytesAtLastEmit) / elapsedSec : 0;
      this.mesh.opts.onTransferUpdate({
        direction: 'in',
        transferId: `${inc.fileId}:${this.peerId}`,
        peerId: this.peerId,
        peerName: this.peerName,
        fileId: inc.fileId,
        fileName: inc.fileName,
        fileSize: inc.fileSize,
        bytesTransferred: inc.receivedBytes,
        speedBps,
        status: 'active',
      });
      inc.lastEmit = now;
      inc.bytesAtLastEmit = inc.receivedBytes;
    }
  }

  _onIncomingEof(msg) {
    const inc = this._incoming;
    if (!inc || inc.fileId !== msg.fileId) {
      console.warn('[webrtc] EOF for unknown/mismatched transfer, ignoring');
      return;
    }
    const blob = new Blob(inc.chunks, { type: inc.mimeType });
    const totalElapsedSec = (performance.now() - inc.startTime) / 1000;
    this._incoming = null; // free the chunk array immediately; blob already holds the bytes

    // Verification (when the sender provided a hash) happens before we ever touch the
    // disk -- a failed check means the bytes are NOT saved.
    (async () => {
      let verified = null; // null = no check was performed (large file, or hashing unavailable)
      if (inc.expectedSha256) {
        try {
          const actual = await sha256Hex(await blob.arrayBuffer());
          verified = actual === inc.expectedSha256;
        } catch (err) {
          console.warn('[webrtc] receive-side integrity check failed to run', err);
        }
      }

      if (verified === false) {
        this.mesh.opts.onTransferUpdate({
          direction: 'in',
          transferId: `${inc.fileId}:${this.peerId}`,
          peerId: this.peerId,
          peerName: this.peerName,
          fileId: inc.fileId,
          fileName: inc.fileName,
          fileSize: inc.fileSize,
          bytesTransferred: inc.receivedBytes,
          status: 'error',
          error: 'Integrity check failed -- the file changed in transit and was NOT saved. Ask the sender to re-share it.',
        });
        return;
      }

      this.mesh.opts.onTransferUpdate({
        direction: 'in',
        transferId: `${inc.fileId}:${this.peerId}`,
        peerId: this.peerId,
        peerName: this.peerName,
        fileId: inc.fileId,
        fileName: inc.fileName,
        fileSize: inc.fileSize,
        bytesTransferred: inc.fileSize,
        speedBps: totalElapsedSec > 0 ? inc.fileSize / totalElapsedSec : 0,
        status: 'done',
        verified: verified === true,
      });

      // Only reachable because the user explicitly clicked Download, requested this
      // exact file, and (when checked) its hash matched -- safe to save now.
      triggerDownload(blob, inc.fileName);
    })();
  }

  close() {
    try {
      this._pausedResolvers.forEach((resolve) => resolve());
      this._pausedResolvers = [];
      if (this.dc) this.dc.close();
      if (this.pc) this.pc.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * MeshManager coordinates every PeerLink for the current room (full mesh:
 * one RTCPeerConnection per remote peer) and owns the registry of files
 * THIS browser has shared into the room (kept only in memory — never
 * uploaded anywhere).
 */
export class MeshManager {
  /**
   * @param {object} opts
   * @param {(peerId:string, type:string, payload:object) => void} opts.signal
   * @param {(peerId:string, state:string) => void} opts.onPeerState
   * @param {(update:object) => void} opts.onTransferUpdate
   * @param {Array<object>} [opts.iceServers] - fetched from GET /api/v1/ice-servers;
   *   falls back to CONFIG.ICE_SERVERS (STUN-only) if not provided or empty.
   */
  constructor(opts) {
    this.opts = opts;
    this.iceServers = opts.iceServers && opts.iceServers.length ? opts.iceServers : CONFIG.ICE_SERVERS;
    this.links = new Map(); // peerId -> PeerLink
    this.localFiles = new Map(); // fileId -> File (files WE shared into this room)
  }

  signal(peerId, type, payload) {
    this.opts.signal(peerId, type, payload);
  }

  /** We are the new arrival — initiate an offer to a peer already in the room. */
  connectToExistingPeer(peerId, peerName) {
    if (this.links.has(peerId)) return;
    const link = new PeerLink(peerId, peerName, true, this);
    this.links.set(peerId, link);
    this._makeOffer(link);
  }

  /** A new peer joined after us — they'll send the offer; just get ready to receive it. */
  prepareForIncomingPeer(peerId, peerName) {
    if (this.links.has(peerId)) return;
    const link = new PeerLink(peerId, peerName, false, this);
    this.links.set(peerId, link);
  }

  async _makeOffer(link) {
    try {
      const offer = await link.pc.createOffer();
      await link.pc.setLocalDescription(offer);
      this.signal(link.peerId, 'SDP_OFFER', { sdp: link.pc.localDescription });
    } catch (err) {
      console.error('[webrtc] createOffer failed', err);
    }
  }

  async handleOffer(peerId, peerName, sdp) {
    let link = this.links.get(peerId);
    if (!link) {
      link = new PeerLink(peerId, peerName, false, this);
      this.links.set(peerId, link);
    }
    await link.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this._flushPendingIce(link);
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    this.signal(peerId, 'SDP_ANSWER', { sdp: link.pc.localDescription });
  }

  async handleAnswer(peerId, sdp) {
    const link = this.links.get(peerId);
    if (!link) return;
    await link.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this._flushPendingIce(link);
  }

  async handleIceCandidate(peerId, candidate) {
    const link = this.links.get(peerId);
    if (!link) return;
    if (!link.pc.remoteDescription) {
      link._pendingIce.push(candidate);
      return;
    }
    try {
      await link.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[webrtc] addIceCandidate failed', err);
    }
  }

  async _flushPendingIce(link) {
    const pending = link._pendingIce;
    link._pendingIce = [];
    for (const c of pending) {
      try {
        await link.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('[webrtc] flush addIceCandidate failed', err);
      }
    }
  }

  // ---- Shared file registry (this browser's uploads) --------------------
  /** Register a local File as available to the room. Returns its generated fileId. */
  shareFile(file) {
    const fileId = uuid();
    this.localFiles.set(fileId, file);
    return fileId;
  }

  /** Forget a locally-shared file — after this, requests for it get 'unavailable'. */
  unshareFile(fileId) {
    this.localFiles.delete(fileId);
  }

  hasLocalFile(fileId) {
    return this.localFiles.has(fileId);
  }

  /** Save one of OUR OWN shared files straight to disk — no network hop needed, we already have the bytes. */
  saveLocalFile(fileId) {
    const file = this.localFiles.get(fileId);
    if (!file) return false;
    triggerDownload(file, file.name);
    return true;
  }

  // ---- Downloading a file someone else shared ----------------------------
  /** Ask `uploaderPeerId` to stream `fileId` to us. No-ops (with an error update) if not connected. */
  requestDownload(fileId, uploaderPeerId, fileMeta) {
    const link = this.links.get(uploaderPeerId);
    if (!link || !link.dc || link.dc.readyState !== 'open') {
      this.opts.onTransferUpdate({
        direction: 'in',
        transferId: `${fileId}:${uploaderPeerId}`,
        peerId: uploaderPeerId,
        peerName: link ? link.peerName : 'peer',
        fileId,
        fileName: fileMeta?.fileName || 'file',
        fileSize: fileMeta?.fileSize || 0,
        bytesTransferred: 0,
        status: 'error',
        error: 'Not connected to that peer yet — try again in a moment.',
      });
      return;
    }
    link.requestFile(fileId);
  }

  removePeer(peerId) {
    const link = this.links.get(peerId);
    if (link) {
      link.close();
      this.links.delete(peerId);
    }
  }

  closeAll() {
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this.localFiles.clear();
  }

  getConnectedCount() {
    let n = 0;
    for (const link of this.links.values()) {
      if (link.dc && link.dc.readyState === 'open') n++;
    }
    return n;
  }
}

export default MeshManager;
