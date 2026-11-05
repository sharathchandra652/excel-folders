// YouTube Data API v3 client. Quota: playlistItems.list and videos.list cost 1 unit
// per call (50 items each), so 4 channels checked hourly use roughly 200 of the
// 10,000 free daily units.
import { config } from './config.js';

const API = 'https://www.googleapis.com/youtube/v3';

async function api(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: config.youtubeApiKey });
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`YouTube ${endpoint} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Video IDs uploaded to a channel since `since` (Date), newest first. */
export async function uploadsSince(channelId, since) {
  const playlistId = `UU${channelId.slice(2)}`; // every channel's "uploads" playlist
  const ids = [];
  let pageToken;
  for (let page = 0; page < 40; page++) {
    const data = await api('playlistItems', {
      part: 'contentDetails',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    let older = 0;
    for (const item of data.items || []) {
      const at = new Date(item.contentDetails.videoPublishedAt || 0);
      if (at >= since) ids.push(item.contentDetails.videoId);
      else older++;
    }
    // The playlist is newest-first; once a page is mostly older than `since`, stop.
    if (!data.nextPageToken || older >= 10) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

function seconds(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

export function formatLength(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A Short opens at /shorts/<id>; a normal video redirects to /watch. */
async function isShort(id, secs) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
  } catch {
    /* fall through to the length rule */
  }
  return secs > 0 && secs <= 180;
}

/** Full details for up to any number of IDs. */
export async function details(ids, channelKey) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await api('videos', {
      part: 'snippet,contentDetails,statistics,liveStreamingDetails',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    for (const v of data.items || []) {
      const secs = seconds(v.contentDetails?.duration);
      const live = v.liveStreamingDetails || ['live', 'upcoming'].includes(v.snippet.liveBroadcastContent);
      const type = live ? 'Live' : (await isShort(v.id, secs)) ? 'Short' : 'Video';
      const lsd = v.liveStreamingDetails || {};
      out.push({
        id: v.id,
        channel: channelKey,
        title: v.snippet.title,
        description: v.snippet.description || '',
        // For live streams the posting time is when the stream started.
        postedAt: new Date(lsd.actualStartTime || lsd.scheduledStartTime || v.snippet.publishedAt).toISOString(),
        type,
        length: formatLength(secs),
        views: Number(v.statistics?.viewCount || 0),
        thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      });
    }
  }
  return out;
}
