/**
 * useP2PShare.js
 * ------------------------------------------------------------------
 * The single hook that owns all p2pShare session state and behavior:
 *   - signaling connection lifecycle
 *   - room create/join/leave/delete
 *   - peer presence + WebRTC mesh formation
 *   - the shared, on-demand file list (share / download / delete)
 *   - live transfer progress
 *   - toasts + the "room destroyed" modal
 *
 * Components never touch SignalingClient or MeshManager directly — they
 * call the functions this hook returns and render the state it exposes.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config.js';
import { SignalingClient } from '../lib/signaling.js';
import { MeshManager } from '../lib/webrtc.js';
import { fetchIceServers } from '../lib/api.js';

let toastSeq = 0;

export function useP2PShare() {
  const [serverStatus, setServerStatus] = useState('connecting'); // 'connecting' | 'online' | 'offline'
  const [screen, setScreen] = useState('landing'); // 'landing' | 'workspace'
  const [busy, setBusy] = useState(false);
  const [landingError, setLandingError] = useState('');

  const [room, setRoom] = useState(null); // { roomCode, displayCode, isHost, maxPeers, selfPeerId }
  const [peers, setPeers] = useState([]); // [{ peerId, name, isHost }]
  const [connStates, setConnStates] = useState({}); // peerId -> connection state string
  const [files, setFiles] = useState([]); // [{ fileId, fileName, fileSize, mimeType, uploaderId, uploaderName, isMine }]
  const [transfers, setTransfers] = useState({}); // transferId -> update object
  const [toasts, setToasts] = useState([]);
  const [destroyedModal, setDestroyedModal] = useState(null); // { title, body } | null

  const signalingRef = useRef(null);
  const meshRef = useRef(null);
  const roomRef = useRef(null); // mirrors `room` for use inside stable callbacks
  const peersRef = useRef([]); // mirrors `peers` for name lookups inside callbacks
  const iceServersRef = useRef(null); // fetched once via REST; null = use CONFIG.ICE_SERVERS fallback

  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const addToast = useCallback((message, type) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, CONFIG.TOAST_DURATION_MS);
  }, []);

  const findPeerName = useCallback((peerId) => {
    const p = peersRef.current.find((x) => x.peerId === peerId);
    return p ? p.name : 'Unknown peer';
  }, []);

  // ---------------------------------------------------------------------
  // ICE servers — fetched once via REST (GET /api/v1/ice-servers). If the
  // backend has TURN configured, this is what actually fixes connectivity
  // between peers behind restrictive/symmetric NAT (e.g. mobile hotspots)
  // that STUN alone can't traverse. Falls back to CONFIG.ICE_SERVERS
  // (STUN-only) if the fetch fails for any reason.
  // ---------------------------------------------------------------------
  useEffect(() => {
    fetchIceServers()
      .then((data) => {
        if (data?.iceServers?.length) iceServersRef.current = data.iceServers;
      })
      .catch((err) => {
        console.warn('[useP2PShare] failed to fetch ICE servers, using STUN-only fallback', err);
      });
  }, []);

  // ---------------------------------------------------------------------
  // Signaling connection — established once, for the lifetime of the app
  // ---------------------------------------------------------------------
  useEffect(() => {
    const signaling = new SignalingClient();
    signalingRef.current = signaling;

    const unsubs = [
      signaling.on('__open', () => setServerStatus('online')),
      signaling.on('__close', () => setServerStatus('offline')),
      signaling.on('__reconnecting', () => setServerStatus('offline')),

      signaling.on('ROOM_CREATED', (msg) => {
        setBusy(false);
        enterRoom(msg);
      }),

      signaling.on('ROOM_JOINED', (msg) => {
        setBusy(false);
        enterRoom(msg);
        (msg.peers || []).forEach((p) => {
          meshRef.current?.connectToExistingPeer(p.peerId, p.name);
          setConnStates((prev) => ({ ...prev, [p.peerId]: 'connecting' }));
        });
      }),

      signaling.on('ERROR', (msg) => {
        setBusy(false);
        if (!roomRef.current) {
          setLandingError(msg.message || 'Something went wrong.');
        } else {
          addToast(msg.message || 'Signaling error.', 'error');
        }
      }),

      signaling.on('PEER_JOINED', (msg) => {
        if (!meshRef.current) return;
        setPeers((prev) => [...prev, { peerId: msg.peerId, name: msg.name, isHost: !!msg.isHost }]);
        setConnStates((prev) => ({ ...prev, [msg.peerId]: 'connecting' }));
        meshRef.current.prepareForIncomingPeer(msg.peerId, msg.name);
        addToast(`${msg.name} joined the room.`);
      }),

      signaling.on('PEER_LEFT', (msg) => {
        if (!meshRef.current) return;
        const left = peersRef.current.find((p) => p.peerId === msg.peerId);
        setPeers((prev) => prev.filter((p) => p.peerId !== msg.peerId));
        setConnStates((prev) => {
          const next = { ...prev };
          delete next[msg.peerId];
          return next;
        });
        meshRef.current.removePeer(msg.peerId);
        if (left) addToast(`${left.name} left the room.`);
      }),

      signaling.on('ROOM_DESTROYED', () => {
        const wasHost = roomRef.current?.isHost;
        meshRef.current?.closeAll();
        setDestroyedModal({
          title: 'Room destroyed',
          body: wasHost
            ? 'You deleted this room. All peers have been disconnected.'
            : 'The host ended this session. All transfers have been stopped.',
        });
      }),

      // The host removed this specific peer (KICK_PEER) — only the kicked peer ever
      // receives this; everyone else just sees the normal PEER_LEFT broadcast.
      signaling.on('KICKED', () => {
        meshRef.current?.closeAll();
        setDestroyedModal({
          title: 'Removed from room',
          body: 'The host removed you from this room.',
        });
      }),

      signaling.on('SDP_OFFER', async (msg) => {
        if (!meshRef.current) return;
        await meshRef.current.handleOffer(msg.fromPeerId, findPeerName(msg.fromPeerId), msg.sdp);
      }),
      signaling.on('SDP_ANSWER', async (msg) => {
        if (!meshRef.current) return;
        await meshRef.current.handleAnswer(msg.fromPeerId, msg.sdp);
      }),
      signaling.on('ICE_CANDIDATE', async (msg) => {
        if (!meshRef.current) return;
        await meshRef.current.handleIceCandidate(msg.fromPeerId, msg.candidate);
      }),

      // ---- Shared file list events ----
      signaling.on('FILE_SHARED', (msg) => {
        setFiles((prev) => [
          ...prev,
          {
            fileId: msg.fileId,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            mimeType: msg.mimeType,
            uploaderId: msg.uploaderId,
            uploaderName: msg.uploaderName,
            sharedAt: msg.sharedAt,
            isMine: false,
          },
        ]);
      }),
      signaling.on('FILE_REMOVED', (msg) => {
        setFiles((prev) => prev.filter((f) => f.fileId !== msg.fileId));
      }),
    ];

    signaling.connect().catch((err) => console.error('[useP2PShare] initial connect failed', err));

    return () => {
      unsubs.forEach((unsub) => unsub());
      signaling.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enterRoom(msg) {
    const selfPeerId = msg.peerId;
    const others = (msg.peers || []).filter((p) => p.peerId !== selfPeerId);

    setRoom({
      roomCode: msg.roomCode,
      displayCode: msg.displayCode,
      isHost: !!msg.isHost,
      maxPeers: msg.maxPeers,
      selfPeerId,
    });
    setConnStates({});
    setTransfers({});

    const meInList = (msg.peers || []).find((p) => p.peerId === selfPeerId);
    setPeers([
      { peerId: selfPeerId, name: meInList ? meInList.name : 'You', isHost: !!msg.isHost },
      ...others.map((p) => ({ peerId: p.peerId, name: p.name, isHost: !!p.isHost })),
    ]);

    setFiles(
      (msg.files || []).map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        uploaderId: f.uploaderId,
        uploaderName: f.uploaderName,
        sharedAt: f.sharedAt,
        isMine: f.uploaderId === selfPeerId,
      }))
    );

    const mesh = new MeshManager({
      iceServers: iceServersRef.current,
      signal: (peerId, type, payload) => signalingRef.current.send(type, { targetPeerId: peerId, ...payload }),
      onPeerState: (peerId, connState) => {
        setConnStates((prev) => ({ ...prev, [peerId]: connState }));
      },
      onTransferUpdate: (update) => {
        setTransfers((prev) => ({ ...prev, [update.transferId]: update }));
      },
    });
    meshRef.current = mesh;

    setScreen('workspace');
    history.replaceState(null, '', `${location.pathname}?room=${msg.roomCode}`);
    addToast(msg.isHost ? `Room ${msg.displayCode} created.` : `Joined ${msg.displayCode}.`, 'success');
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  const ensureConnected = useCallback(async () => {
    const signaling = signalingRef.current;
    if (!signaling.isOpen()) {
      await signaling.connect().catch(() => {});
    }
    return signaling.isOpen();
  }, []);

  const createRoom = useCallback(
    async (name) => {
      setLandingError('');
      if (!name) return setLandingError('Please enter a display name.');
      if (!(await ensureConnected())) return setLandingError('Not connected to signaling server yet — try again in a moment.');
      setBusy(true);
      signalingRef.current.send('CREATE_ROOM', { peerName: name });
    },
    [ensureConnected]
  );

  const joinRoom = useCallback(
    async (name, roomCode) => {
      setLandingError('');
      if (!name) return setLandingError('Please enter a display name.');
      if (!roomCode) return setLandingError('Please enter a room code.');
      if (!(await ensureConnected())) return setLandingError('Not connected to signaling server yet — try again in a moment.');
      setBusy(true);
      signalingRef.current.send('JOIN_ROOM', { peerName: name, roomCode });
    },
    [ensureConnected]
  );

  const resetToLanding = useCallback(() => {
    setRoom(null);
    setPeers([]);
    setConnStates({});
    setFiles([]);
    setTransfers({});
    meshRef.current = null;
    history.replaceState(null, '', location.pathname);
    setScreen('landing');
  }, []);

  const leaveRoom = useCallback(() => {
    signalingRef.current?.send('LEAVE_ROOM', {});
    meshRef.current?.closeAll();
    resetToLanding();
  }, [resetToLanding]);

  const deleteRoom = useCallback(() => {
    signalingRef.current?.send('DELETE_ROOM', {});
    // Server broadcasts ROOM_DESTROYED back to us too — teardown happens on that event.
  }, []);

  /** Host-only: remove a specific peer from the room. The server enforces the host check too. */
  const kickPeer = useCallback((peerId) => {
    signalingRef.current?.send('KICK_PEER', { targetPeerId: peerId });
  }, []);

  const dismissDestroyedModal = useCallback(() => {
    setDestroyedModal(null);
    resetToLanding();
  }, [resetToLanding]);

  const copyRoomLink = useCallback(async () => {
    if (!roomRef.current) return;
    const url = `${location.origin}${location.pathname}?room=${roomRef.current.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }, []);

  /** Share one or more files into the room — everyone gets a Download card immediately. */
  const shareFiles = useCallback(
    (fileList) => {
      if (!meshRef.current || !roomRef.current) return;
      const selfPeerId = roomRef.current.selfPeerId;
      const selfName = peersRef.current.find((p) => p.peerId === selfPeerId)?.name || 'You';

      fileList.forEach((file) => {
        const fileId = meshRef.current.shareFile(file);
        const record = {
          fileId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          uploaderId: selfPeerId,
          uploaderName: selfName,
          sharedAt: Date.now(),
          isMine: true,
        };
        setFiles((prev) => [...prev, record]);
        signalingRef.current.send('FILE_SHARE', {
          fileId,
          fileName: record.fileName,
          fileSize: record.fileSize,
          mimeType: record.mimeType,
        });
      });
    },
    []
  );

  /** Download a file — pulls it, on demand, directly from the uploader's browser over WebRTC. */
  const downloadFile = useCallback((file) => {
    if (!meshRef.current) return;
    if (file.isMine) {
      // We already have the bytes locally — save immediately, no network hop needed.
      meshRef.current.saveLocalFile(file.fileId);
      return;
    }
    meshRef.current.requestDownload(file.fileId, file.uploaderId, file);
  }, []);

  /** Remove a file we uploaded — everyone's list updates immediately. */
  const deleteFile = useCallback((file) => {
    if (!meshRef.current || !file.isMine) return;
    meshRef.current.unshareFile(file.fileId);
    setFiles((prev) => prev.filter((f) => f.fileId !== file.fileId));
    signalingRef.current.send('FILE_DELETE', { fileId: file.fileId });
  }, []);

  const dropFiles = useCallback(
    (fileList) => {
      if (!meshRef.current) return;
      shareFiles(fileList);
    },
    [shareFiles]
  );

  return {
    // state
    serverStatus,
    screen,
    busy,
    landingError,
    room,
    peers,
    connStates,
    files,
    transfers,
    toasts,
    destroyedModal,
    // actions
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    kickPeer,
    copyRoomLink,
    dropFiles,
    downloadFile,
    deleteFile,
    dismissDestroyedModal,
    clearLandingError: () => setLandingError(''),
  };
}

export default useP2PShare;
