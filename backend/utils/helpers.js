import { nanoid } from "nanoid";
import crypto from "crypto";
import config from "../config/config.js";

export function generateUserId() {
  return `user_${nanoid(10)}`;
}

export function generateRoomId() {
  return nanoid(config.room.roomIdLength);
}

export function generateFileId() {
  return `file_${nanoid(12)}`;
}

export function generateDownloadId() {
  return `download_${nanoid(12)}`;
}

export function now() {
  return Date.now();
}

export function bytesToHuman(bytes) {
  if (bytes === 0) return "0 Bytes";

  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const i = Math.floor(
    Math.log(bytes) / Math.log(1024)
  );

  return (
    (bytes / Math.pow(1024, i)).toFixed(2) +
    " " +
    units[i]
  );
}

export function calculateChunks(fileSize) {
  return Math.ceil(
    fileSize / config.transfer.chunkSize
  );
}

export function calculateProgress(
  completed,
  total
) {
  if (total === 0) return 0;

  return Math.floor(
    (completed / total) * 100
  );
}

export function checksum(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

export function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

export function isEmpty(value) {
  if (value === null) return true;
  if (value === undefined) return true;

  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}

export function safeJsonParse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function safeJsonStringify(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return "{}";
  }
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

export function unique(array) {
  return [...new Set(array)];
}

export function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

export function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

export function chunkRange(totalChunks) {
  return Array.from(
    { length: totalChunks },
    (_, i) => i
  );
}

export function debounce(fn, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function throttle(fn, delay) {
  let waiting = false;

  return (...args) => {
    if (waiting) return;

    waiting = true;

    fn(...args);

    setTimeout(() => {
      waiting = false;
    }, delay);
  };
}