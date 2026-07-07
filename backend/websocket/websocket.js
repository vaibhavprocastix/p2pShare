import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

import MESSAGE_TYPES from "../constants/messageTypes.js";
import ERROR_CODES from "../constants/errorCodes.js";

import Router from "./router.js";
import {
  parseMessage,
  validateMessage,
  send,
  buildError
} from "./parser.js";

import PeerController from "../controllers/peerController.js";
import PresenceService from "../services/presenceService.js";
import config from "../config/config.js";

export function setupWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    maxPayload: config.websocket.maxPayload
  });

  console.log("✓ WebSocket Server Started");

  wss.on("connection", (ws) => {
    const socketId = randomUUID();

    ws.socketId = socketId;
    ws.userId = null;

    console.log(`Client Connected : ${socketId}`);

    // ----------------------------------
    // Message
    // ----------------------------------

    ws.on("message", async (raw) => {
      try {
        const message = parseMessage(raw);

        if (!validateMessage(message)) {
          return send(
            ws,
            buildError(
              ERROR_CODES.INVALID_MESSAGE,
              "Invalid WebSocket message."
            )
          );
        }

        // -----------------------------
        // Initial registration
        // -----------------------------

        if (
          message.type === MESSAGE_TYPES.CONNECT
        ) {
          if (!message.userId) {
            return send(
              ws,
              buildError(
                ERROR_CODES.INVALID_REQUEST,
                "userId is required."
              )
            );
          }

          ws.userId = message.userId;

          await PresenceService.setOnline(
            message.userId,
            socketId
          );

          await PeerController.userConnected(
            message.userId,
            ws
          );

          return send(ws, {
            success: true,
            type: MESSAGE_TYPES.CONNECT,
            socketId
          });
        }

        // -----------------------------
        // Everything else
        // -----------------------------

        const response =
          await Router.handle(ws, message);

        if (response) {
          send(ws, response);
        }
      } catch (err) {
        console.error(err);

        send(
          ws,
          buildError(
            ERROR_CODES.UNKNOWN_ERROR,
            err.message
          )
        );
      }
    });

    // ----------------------------------
    // Pong
    // ----------------------------------

    ws.on("pong", async () => {
      if (ws.userId) {
        await PresenceService.heartbeat(
          ws.userId
        );
      }
    });

    // ----------------------------------
    // Close
    // ----------------------------------

    ws.on("close", async () => {
      console.log(
        `Disconnected : ${socketId}`
      );

      if (ws.userId) {
        await PeerController.userDisconnected(
          ws.userId
        );
      }
    });

    // ----------------------------------
    // Error
    // ----------------------------------

    ws.on("error", (err) => {
      console.error(
        "WebSocket Error:",
        err.message
      );
    });
  });

  // --------------------------------------
  // Heartbeat
  // --------------------------------------

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    });
  }, config.websocket.heartbeatInterval);

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
}