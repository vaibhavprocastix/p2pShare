/**
 * signaling.js
 * ------------------------------------------------------------------
 * Thin wrapper around the browser WebSocket API that talks to the
 * p2pShare signaling server. Responsible ONLY for:
 *   - connecting / reconnecting the WS
 *   - sending typed JSON messages
 *   - fanning out incoming JSON messages to subscribers by `type`
 * It knows nothing about WebRTC or React — pure transport + events,
 * so it can be driven from a hook, a class component, or a test.
 * ------------------------------------------------------------------
 */
import { CONFIG } from '../config.js';

export class SignalingClient {
  /** @param {string} [url] - defaults to CONFIG.SIGNALING_URL */
  constructor(url) {
    this.url = url || CONFIG.SIGNALING_URL;
    this.ws = null;
    this.listeners = new Map(); // type -> Set<fn>
    this.wildcardListeners = new Set(); // fn(type, payload)
    this._reconnectAttempts = 0;
    this._manualClose = false;
    this._connectPromise = null;
    this._pingTimer = null;
  }

  /** @returns {Promise<void>} resolves once the socket is OPEN */
  connect() {
    if (this._connectPromise) return this._connectPromise;
    this._manualClose = false;
    this._connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.addEventListener('open', () => {
        this._reconnectAttempts = 0;
        this._emit('__open', null);
        this._startPing();
        resolve();
      });

      this.ws.addEventListener('message', (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          console.warn('[signaling] received non-JSON message', evt.data);
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;
        this._emit(msg.type, msg);
      });

      this.ws.addEventListener('close', (evt) => {
        this._stopPing();
        this._emit('__close', evt);
        this._connectPromise = null;
        if (!this._manualClose) this._scheduleReconnect();
      });

      this.ws.addEventListener('error', (evt) => {
        this._emit('__error', evt);
        reject(evt);
      });
    });
    return this._connectPromise;
  }

  _scheduleReconnect() {
    this._reconnectAttempts += 1;
    const delay = Math.min(500 * 2 ** this._reconnectAttempts, CONFIG.RECONNECT_MAX_DELAY_MS);
    this._emit('__reconnecting', { attempt: this._reconnectAttempts, delayMs: delay });
    setTimeout(() => {
      if (this._manualClose) return;
      this.connect().catch(() => {});
    }, delay);
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => this.send('PING', {}), CONFIG.HEARTBEAT_PING_INTERVAL_MS);
  }

  _stopPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  close() {
    this._manualClose = true;
    this._stopPing();
    if (this.ws) this.ws.close(1000, 'CLIENT_CLOSED');
  }

  /**
   * Subscribe to a message type. Use '*' to receive every message.
   * @returns {() => void} unsubscribe function
   */
  on(type, fn) {
    if (type === '*') {
      this.wildcardListeners.add(fn);
      return () => this.wildcardListeners.delete(fn);
    }
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  off(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }

  _emit(type, payload) {
    this.listeners.get(type)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[signaling] listener error for ${type}`, err);
      }
    });
    this.wildcardListeners.forEach((fn) => {
      try {
        fn(type, payload);
      } catch (err) {
        console.error('[signaling] wildcard listener error', err);
      }
    });
  }

  /** Send a typed JSON message. Silently no-ops if the socket isn't open. */
  send(type, payload) {
    if (!this.isOpen()) {
      console.warn(`[signaling] cannot send ${type}, socket not open`);
      return false;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

export default SignalingClient;
