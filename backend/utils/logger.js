const LOG_LEVELS = Object.freeze({
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
});

const CURRENT_LEVEL =
  LOG_LEVELS[
    (process.env.LOG_LEVEL || "INFO").toUpperCase()
  ] ?? LOG_LEVELS.INFO;

function timestamp() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if (LOG_LEVELS[level] <= CURRENT_LEVEL) {
    console.log(
      `[${timestamp()}] [${level}]`,
      ...args
    );
  }
}

function error(...args) {
  log("ERROR", ...args);
}

function warn(...args) {
  log("WARN", ...args);
}

function info(...args) {
  log("INFO", ...args);
}

function debug(...args) {
  log("DEBUG", ...args);
}

function websocket(direction, payload) {
  debug(
    `[WebSocket ${direction}]`,
    JSON.stringify(payload, null, 2)
  );
}

function room(action, roomId, userId = "") {
  info(
    `[Room] ${action}`,
    `room=${roomId}`,
    userId ? `user=${userId}` : ""
  );
}

function file(action, fileId, ownerId = "") {
  info(
    `[File] ${action}`,
    `file=${fileId}`,
    ownerId ? `owner=${ownerId}` : ""
  );
}

function download(action, downloadId) {
  info(
    `[Download] ${action}`,
    `download=${downloadId}`
  );
}

export default {
  error,
  warn,
  info,
  debug,
  websocket,
  room,
  file,
  download
};