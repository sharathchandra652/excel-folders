// Tiny JSON-file store: every video ever seen plus the review status the user set.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = () => path.join(config.dataDir, 'videos.json');
let cache = null;

export function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cache = { videos: {}, status: {} };
  }
  cache.videos ||= {};
  cache.status ||= {};
  return cache;
}

export function save() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file()); // atomic replace, so a crash never leaves half a file
}

export function upsertVideos(list) {
  const db = load();
  for (const v of list) db.videos[v.id] = { ...db.videos[v.id], ...v };
  save();
}

export function setStatus(id, status) {
  load().status[id] = status;
}

export function statusOf(id) {
  return load().status[id] || 'New';
}

export function videosFor(channelKey) {
  return Object.values(load().videos)
    .filter((v) => v.channel === channelKey)
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
}

/** For tests and the preview script. */
export function useMemoryStore(data) {
  cache = { videos: {}, status: {}, ...data };
}
