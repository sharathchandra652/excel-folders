// The jobs the n8n workflows call: collect new uploads, build files, build the email.
import { CHANNELS, config } from './config.js';
import { uploadsSince, details } from './youtube.js';
import { summarise, digest } from './claude.js';
import * as store from './store.js';
import { ist, istMidnight, todayIst, addDays, dateRange, dmy, clock } from './time.js';
import { dayStats } from './stats.js';
import {
  buildDaily, buildHistory, buildDashboard, readStatuses,
  dailyPath, historyPath, dashboardPath, dailyName, historyName, dashboardName,
} from './excel.js';

/** Fetch uploads since `since` (default: 2 hours before the newest one we have). */
export async function collect({ since } = {}) {
  if (!config.youtubeApiKey) throw new Error('YOUTUBE_API_KEY is not set');
  const report = {};
  for (const ch of CHANNELS) {
    const known = store.videosFor(ch.key);
    const from = since
      ? istMidnight(since)
      : known.length
        ? new Date(Date.parse(known.at(-1).postedAt) - 2 * 3600e3) // overlap catches late-listed uploads
        : istMidnight(config.startDate);
    const floor = istMidnight(config.startDate);
    const ids = await uploadsSince(ch.channelId, from < floor ? floor : from);
    // New videos, plus known ones still missing a summary (a failed Claude call is retried).
    const todo = ids.filter((id) => !store.load().videos[id] || !store.load().videos[id].summary);
    let fresh = todo.length ? await details(todo, ch.key) : [];
    fresh = fresh.filter((v) => new Date(v.postedAt) >= floor);
    const withAi = await summarise(fresh, ch.name);
    store.upsertVideos(withAi);
    report[ch.name] = { checked: ids.length, added: withAi.length, summarised: withAi.filter((v) => v.summary).length };
  }
  return { ok: true, at: new Date().toISOString(), channels: report };
}

/** Status values the user typed in OneDrive are copied back before files are rebuilt. */
export async function importStatuses(buffer) {
  let rows;
  try {
    rows = await readStatuses(buffer);
  } catch {
    return { ok: false, updated: 0, reason: 'not an xlsx file (probably not created yet)' };
  }
  let updated = 0;
  for (const { id, status } of rows) {
    if (!store.load().videos[id]) continue;
    // "New" never overwrites a status the user already set somewhere else.
    if (status !== 'New' && store.statusOf(id) !== status) {
      store.setStatus(id, status);
      updated++;
    }
  }
  if (updated) store.save();
  return { ok: true, updated, rows: rows.length };
}

/** Dates whose daily files change on this run: today, plus yesterday just after midnight. */
function activeDates(now) {
  const today = todayIst(now);
  return ist(now).hour < 2 ? [addDays(today, -1), today] : [today];
}

/** OneDrive paths whose Status column should be imported before rebuilding. */
export function harvestPaths(now = new Date()) {
  const paths = [];
  for (const ch of CHANNELS) {
    paths.push(historyPath(ch));
    for (const d of activeDates(now)) paths.push(dailyPath(ch, d));
  }
  return paths;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const file = (path, name, buffer) => ({ path, name, size: buffer.length, mimeType: XLSX, base64: buffer.toString('base64') });

/**
 * Files to upload. `dates` defaults to the active dates; `from`/`to` rebuild a range (backfill).
 * History files and the dashboard are always included.
 */
export async function buildFiles({ from, to, now = new Date() } = {}) {
  const dates = from ? dateRange(from, to || todayIst(now)) : activeDates(now);
  const out = [];
  const byChannel = {};
  for (const ch of CHANNELS) {
    const vids = store.videosFor(ch.key);
    byChannel[ch.key] = vids;
    for (const d of dates) {
      const { buffer } = await buildDaily(ch, d, vids, now);
      out.push(file(dailyPath(ch, d), dailyName(ch, d), buffer));
    }
    out.push(file(historyPath(ch), historyName(ch), (await buildHistory(ch, vids, now)).buffer));
  }
  out.push(file(dashboardPath(), dashboardName, (await buildDashboard(byChannel, now)).buffer));
  return { ok: true, count: out.length, files: out };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * The daily email as a ready-to-send Microsoft Graph /me/sendMail body.
 * The 4 daily task sheets are attached when they fit; links to the OneDrive folders are always included.
 */
export async function dailyReport({ date, webUrl, now = new Date() } = {}) {
  date ||= todayIst(now);
  const perChannel = [];
  const attachments = [];
  for (const ch of CHANNELS) {
    const vids = store.videosFor(ch.key);
    const s = dayStats(vids, date, now);
    const day = vids.filter((v) => ist(v.postedAt).date === date);
    perChannel.push({
      ch, s,
      name: ch.name,
      videos: day.map((v) => ({ ...v, time: clock(ist(v.postedAt).hour, ist(v.postedAt).minute) })),
      reviewed: day.filter((v) => store.statusOf(v.id) !== 'New').length,
    });
    const { buffer } = await buildDaily(ch, date, vids, now);
    attachments.push({ '@odata.type': '#microsoft.graph.fileAttachment', name: dailyName(ch, date), contentType: XLSX, contentBytes: buffer.toString('base64'), size: buffer.length });
  }
  const totalBytes = attachments.reduce((n, a) => n + a.size, 0);
  const attach = totalBytes <= config.maxAttachmentBytes;
  const ai = await digest(date, perChannel);
  const top = new Map((ai?.channels || []).map((c) => [c.channel, c.topStories]));

  const rows = perChannel.map(({ name, s, reviewed }) => `
    <tr><td><b>${esc(name)}</b></td><td align="center">${s.total}</td><td align="center">${s.videos}/${s.shorts}/${s.lives}</td>
    <td align="center">${s.activeHours}/${s.hoursElapsed}</td><td>${esc(s.longestGapText)}</td>
    <td><b style="color:${s.verdict === 'Hourly poster' ? '#1e7b34' : s.verdict === 'Regular' ? '#9c6500' : '#c00000'}">${esc(s.verdict)}</b></td>
    <td align="center">${reviewed}/${s.total}</td></tr>`).join('');
  const stories = perChannel.map(({ name }) => `<p><b>${esc(name)}:</b> ${esc(top.get(name) || 'No digest available.')}</p>`).join('');
  const themes = (ai?.commonThemes || []).map((t) => `<li>${esc(t)}</li>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">
    <h2 style="color:#1F3A5F;margin:0 0 4px">News Tracker · ${dmy(date)} (${ist(`${date}T12:00:00Z`).day})</h2>
    <p style="color:#555;margin:0 0 14px">Daily task sheets for 4 channels${attach ? ' are attached' : ' are in OneDrive (too large to attach today)'}.</p>
    <h3 style="color:#1F3A5F">Posting report</h3>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#d0d7de;font-size:13px">
      <tr style="background:#1F3A5F;color:#fff"><th>Channel</th><th>Posts</th><th>Video/Short/Live</th><th>Active hours</th><th>Longest gap</th><th>Verdict</th><th>Reviewed</th></tr>${rows}
    </table>
    <h3 style="color:#1F3A5F">Top stories</h3>${stories}
    ${themes ? `<h3 style="color:#1F3A5F">Common across channels</h3><ul>${themes}</ul>` : ''}
    ${webUrl ? `<p><a href="${esc(webUrl)}">Open the News Tracker folder in OneDrive</a> (History files and the 30-day dashboard are there).</p>` : ''}
  </div>`;

  return {
    ok: true,
    attached: attach,
    totalBytes,
    sendMail: {
      message: {
        subject: `News Tracker · ${dmy(date)} · ${perChannel.map((c) => `${c.name} ${c.s.total}`).join(' · ')}`,
        body: { contentType: 'HTML', content: html },
        toRecipients: config.emailTo.map((address) => ({ emailAddress: { address } })),
        attachments: attach ? attachments.map(({ size, ...a }) => a) : [],
      },
      saveToSentItems: true,
    },
  };
}
