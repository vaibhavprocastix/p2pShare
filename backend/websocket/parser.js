import MESSAGE_TYPES from "../constants/messageTypes.js";

export function parseMessage(rawMessage) {
  try {
    const message =
      typeof rawMessage === "string"
        ? JSON.parse(rawMessage)
        : JSON.parse(rawMessage.toString());

    if (!message.type) {
      throw new Error("Missing message type");
    }

    return message;
  } catch (err) {
    return {
      type: MESSAGE_TYPES.ERROR,
      success: false,
      message: "Invalid JSON message.",
      error: err.message
    };
  }
}

export function validateMessage(message) {
  if (!message) return false;

  if (typeof message !== "object") return false;

  if (!message.type) return false;

  return true;
}

export function buildMessage(type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    ...payload
  };
}

export function buildSuccess(type, payload = {}) {
  return {
    success: true,
    type,
    timestamp: Date.now(),
    ...payload
  };
}

export function buildError(code, message) {
  return {
    success: false,
    type: MESSAGE_TYPES.ERROR,
    code,
    message,
    timestamp: Date.now()
  };
}

export function send(ws, message) {
  if (!ws) return;

  if (ws.readyState !== ws.OPEN) return;

  ws.send(JSON.stringify(message));
}