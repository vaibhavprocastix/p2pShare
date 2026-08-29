/**
 * format.js — small, pure formatting helpers shared across components.
 */

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec) {
  if (!isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.00 MB/s';
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function initialsOf(name) {
  if (!name) return '?';
  return name.trim().slice(0, 2).toUpperCase();
}

export const NODE_COLORS = ['#5eead4', '#fb923c', '#60a5fa', '#c084fc', '#4ade80', '#f472b6'];
