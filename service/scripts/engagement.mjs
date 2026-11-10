// Engagement report: views, likes, comments and comment mood for every video.
//   node service/scripts/engagement.mjs [fromDate] [toDate]   (YYYY-MM-DD, IST; default 2026-11-01 .. today)
// Writes "daily excels/Engagement - DD-MM-YYYY.xlsx" per day (one sheet per channel + Summary).
// Dislike counts are not available: YouTube removed them from its public API in Dec 2021.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) throw new Error('YOUTUBE_API_KEY is not set');
const API = 'https://www.googleapis.com/youtube/v3';
const { CHANNELS } = await import('../src/config.js');
const istDay = (iso) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
const istTime = (iso) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(11, 16);
const today = istDay(new Date().toISOString());
const [from = '2026-11-01', to = today] = process.argv.slice(2);

const all = Object.values(JSON.parse(fs.readFileSync(path.join(repo, 'reports/data/videos.json'))).videos)
  .filter((v) => istDay(v.postedAt) >= from && istDay(v.postedAt) <= to);

const get = async (url) => { const r = await fetch(url); const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error?.message), { code: r.status, reason: j.error?.errors?.[0]?.reason }); return j; };

// 1. statistics (50 ids per call)
const stats = {};
for (let i = 0; i < all.length; i += 50) {
  const ids = all.slice(i, i + 50).map((v) => v.id).join(',');
  const j = await get(`${API}/videos?part=statistics&id=${ids}&key=${KEY}`);
  for (const it of j.items) stats[it.id] = it.statistics;
}

// 2. comment mood from up to 50 top comments (simple keyword/emoji scoring, Telugu + English)
const POS = /👍|❤|♥|🔥|👏|🙏|💐|💪|😍|🥰|super|good|nice|great|best|excellent|correct|true|well ?done|thank|jai|జై|సూపర్|బాగుంది|బాగా|మంచి|ధన్యవాద|నిజం|శుభ|అభినందన|గ్రేట్|సలాం/i;
const NEG = /👎|😡|🤬|😠|🤮|💩|waste|fake|bad|worst|shame|chee|fraud|lie|liar|cheat|paid|useless|ఛీ|చీ|దొంగ|మోసం|అబద్ధ|అబద్దం|సిగ్గు|బాలేదు|వేస్ట్|ఫేక్|దరిద్ర|బ్రోకర్/i;
const mood = {};
for (const v of all) {
  const m = { pos: 0, neg: 0, read: 0, note: '' };
  try {
    const j = await get(`${API}/commentThreads?part=snippet&order=relevance&maxResults=50&textFormat=plainText&videoId=${v.id}&key=${KEY}`);
    for (const t of j.items) {
      const s = t.snippet.topLevelComment.snippet.textDisplay;
      const p = POS.test(s), n = NEG.test(s);
      m.read++; if (p && !n) m.pos++; else if (n && !p) m.neg++;
    }
  } catch (e) { m.note = e.reason === 'commentsDisabled' ? 'Comments off' : 'Not available'; }
  mood[v.id] = m;
}
const moodLabel = (m) => m.note || (!m.read ? 'No comments' : m.pos === 0 && m.neg === 0 ? 'Neutral'
  : m.pos >= 2 * m.neg ? 'Positive' : m.neg >= 2 * m.pos ? 'Negative' : 'Mixed');
const respLabel = (r) => (r >= 5 ? 'High' : r >= 2 ? 'Medium' : 'Low');

// 3. workbooks
const C = { head: 'FF1F4E78', sub: 'FFDDEBF7', alt: 'FFF7F9FC', Positive: 'FFC6EFCE', Negative: 'FFFFC7CE', Mixed: 'FFFFEB9C', High: 'FFC6EFCE', Medium: 'FFFFEB9C', Low: 'FFFFC7CE' };
const border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const COLS = [
  ['S.No', 6], ['Time (IST)', 10], ['Type', 8], ['Title', 50], ['About (AI)', 50], ['Link', 14],
  ['Views', 10], ['Likes', 9], ['Dislikes', 10], ['Comments', 11], ['Positive', 9], ['Negative', 10],
  ['Comment mood', 14], ['Engagement %', 13], ['Response', 11],
];
const outDir = path.join(repo, 'daily excels');
fs.mkdirSync(outDir, { recursive: true });
const dmy = (d) => d.split('-').reverse().join('-');
const days = [...new Set(all.map((v) => istDay(v.postedAt)))].sort();
for (let d = from; d <= to; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) if (!days.includes(d)) days.push(d);
days.sort();

for (const day of days) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] });
  const summaryRows = [];
  for (const ch of CHANNELS) {
    const vids = all.filter((v) => v.channel === ch.key && istDay(v.postedAt) === day).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    const ws = wb.addWorksheet(ch.name, { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = COLS.map(([, w]) => ({ width: w }));
    ws.mergeCells(1, 1, 1, COLS.length);
    Object.assign(ws.getCell('A1'), { value: `${ch.name} · Views, likes & comments · ${dmy(day)}` });
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = fill(C.head); ws.getRow(1).height = 26; ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
    ws.mergeCells(2, 1, 2, COLS.length);
    ws.getCell('A2').value = 'Dislikes: hidden by YouTube since 2021 (not in the public API). Comment mood: keyword/emoji scoring of up to 50 top comments. Response: engagement % = (likes + comments) ÷ views; High ≥ 5%, Medium ≥ 2%, Low < 2%.';
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF595959' } };
    const h = ws.getRow(3); h.values = COLS.map(([n]) => n); h.height = 20;
    h.eachCell((c) => { c.font = { bold: true }; c.fill = fill(C.sub); c.border = border; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    let tv = 0, tl = 0, tc = 0, tp = 0, tn = 0, live = 0;
    vids.forEach((v, i) => {
      const s = stats[v.id] || {}, m = mood[v.id];
      const views = +s.viewCount || 0, likes = +s.likeCount || 0, comments = +s.commentCount || 0;
      const eng = views ? ((likes + comments) / views) * 100 : 0;
      tv += views; tl += likes; tc += comments; tp += m.pos; tn += m.neg; if (v.type === 'Live') live++;
      const r = ws.addRow([i + 1, istTime(v.postedAt), v.type, v.title, v.summary || '', { text: 'Open', hyperlink: `https://youtu.be/${v.id}` },
        views, likes, 'Hidden', comments, m.pos, m.neg, moodLabel(m), +eng.toFixed(2), respLabel(eng)]);
      r.eachCell({ includeEmpty: true }, (c, n) => {
        c.border = border; c.alignment = { vertical: 'top', wrapText: n === 4 || n === 5, horizontal: n === 4 || n === 5 ? 'left' : 'center' };
        if (i % 2) c.fill = fill(C.alt);
      });
      r.getCell(6).font = { color: { argb: 'FF0563C1' }, underline: true };
      [7, 8, 10].forEach((n) => (r.getCell(n).numFmt = '#,##0'));
      r.getCell(9).font = { color: { argb: 'FF808080' }, italic: true };
      if (C[r.getCell(13).value]) r.getCell(13).fill = fill(C[r.getCell(13).value]);
      r.getCell(15).fill = fill(C[r.getCell(15).value]);
    });
    if (!vids.length) { const r = ws.addRow(['', '', '', 'No posts on this day']); r.getCell(4).font = { color: { argb: 'FFC00000' }, bold: true }; }
    else {
      const eng = tv ? ((tl + tc) / tv) * 100 : 0;
      const r = ws.addRow(['', 'Total', '', `${vids.length} posts (${live} Live)`, '', '', tv, tl, 'Hidden', tc, tp, tn,
        moodLabel({ pos: tp, neg: tn, read: tp + tn || 1, note: '' }), +eng.toFixed(2), respLabel(eng)]);
      r.eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.fill = fill(C.sub); c.border = border; c.alignment = { horizontal: 'center' }; });
      [7, 8, 10].forEach((n) => (r.getCell(n).numFmt = '#,##0'));
      summaryRows.push([ch.name, vids.length, live, tv, tl, tc, tp, tn, moodLabel({ pos: tp, neg: tn, read: 1, note: '' }), +eng.toFixed(2), respLabel(eng)]);
      continue;
    }
    summaryRows.push([ch.name, 0, 0, 0, 0, 0, 0, 0, '—', 0, '—']);
  }
  const SC = [['Channel', 18], ['Posts', 8], ['Live', 7], ['Views', 11], ['Likes', 10], ['Comments', 11], ['Positive', 10], ['Negative', 10], ['Comment mood', 15], ['Engagement %', 14], ['Response', 11]];
  sum.columns = SC.map(([, w]) => ({ width: w }));
  sum.mergeCells(1, 1, 1, SC.length);
  sum.getCell('A1').value = `All channels · Engagement summary · ${dmy(day)}`;
  sum.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }; sum.getCell('A1').fill = fill(C.head); sum.getRow(1).height = 26;
  sum.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  sum.mergeCells(2, 1, 2, SC.length);
  sum.getCell('A2').value = 'Views/likes/comments as of report time. Dislikes are not published by YouTube.';
  sum.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF595959' } };
  const sh = sum.getRow(3); sh.values = SC.map(([n]) => n); sh.height = 20;
  sh.eachCell((c) => { c.font = { bold: true }; c.fill = fill(C.sub); c.border = border; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
  for (const row of summaryRows) {
    const r = sum.addRow(row);
    r.eachCell({ includeEmpty: true }, (c, n) => { c.border = border; c.alignment = { horizontal: n === 1 ? 'left' : 'center' }; });
    r.getCell(1).font = { bold: true };
    [4, 5, 6].forEach((n) => (r.getCell(n).numFmt = '#,##0'));
    if (C[row[8]]) r.getCell(9).fill = fill(C[row[8]]);
    if (C[row[10]]) r.getCell(11).fill = fill(C[row[10]]);
  }
  await wb.xlsx.writeFile(path.join(outDir, `Engagement - ${dmy(day)}.xlsx`));
  console.log(dmy(day), summaryRows.map((r) => `${r[0]}: ${r[1]} posts, ${r[3]} views, ${r[4]} likes, ${r[5]} comments, ${r[8]}, ${r[10]}`).join(' | '));
}

// 4. one combined list: every upload per channel, day by day
{
  const wb = new ExcelJS.Workbook();
  const L = [['Date', 12], ['Day', 11], ['Time', 8], ['Type', 8], ['Category', 13], ['Title', 55], ['About (AI)', 55], ['Link', 8], ['Views', 10], ['Likes', 9], ['Comments', 11], ['Comment mood', 14], ['Response', 11]];
  for (const ch of CHANNELS) {
    const ws = wb.addWorksheet(ch.name, { views: [{ state: 'frozen', ySplit: 2 }] });
    ws.columns = L.map(([, w]) => ({ width: w }));
    ws.mergeCells(1, 1, 1, L.length);
    ws.getCell('A1').value = `${ch.name} · Daily uploads · ${dmy(from)} to ${dmy(to)}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }; ws.getCell('A1').fill = fill(C.head); ws.getRow(1).height = 26;
    const h = ws.getRow(2); h.values = L.map(([n]) => n);
    h.eachCell((c) => { c.font = { bold: true }; c.fill = fill(C.sub); c.border = border; c.alignment = { horizontal: 'center' }; });
    for (const day of days) {
      const vids = all.filter((v) => v.channel === ch.key && istDay(v.postedAt) === day).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
      const wd = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
      const band = ws.addRow([`${dmy(day)} · ${wd} · ${vids.length} upload${vids.length === 1 ? '' : 's'}`]);
      ws.mergeCells(band.number, 1, band.number, L.length);
      band.getCell(1).font = { bold: true, color: { argb: vids.length ? 'FF1F4E78' : 'FFC00000' } }; band.getCell(1).fill = fill(vids.length ? 'FFE2EFDA' : 'FFFFC7CE');
      vids.forEach((v, i) => {
        const s = stats[v.id] || {}, m = mood[v.id], views = +s.viewCount || 0, likes = +s.likeCount || 0, comm = +s.commentCount || 0;
        const eng = views ? ((likes + comm) / views) * 100 : 0;
        const r = ws.addRow([dmy(day), wd, istTime(v.postedAt), v.type, v.category || '', v.title, v.summary || '', { text: 'Open', hyperlink: `https://youtu.be/${v.id}` }, views, likes, comm, moodLabel(m), respLabel(eng)]);
        r.eachCell({ includeEmpty: true }, (c, n) => { c.border = border; c.alignment = { vertical: 'top', wrapText: n === 6 || n === 7, horizontal: n === 6 || n === 7 ? 'left' : 'center' }; if (i % 2) c.fill = fill(C.alt); });
        r.getCell(8).font = { color: { argb: 'FF0563C1' }, underline: true };
        [9, 10, 11].forEach((n) => (r.getCell(n).numFmt = '#,##0'));
        if (C[r.getCell(12).value]) r.getCell(12).fill = fill(C[r.getCell(12).value]);
        r.getCell(13).fill = fill(C[r.getCell(13).value]);
      });
    }
  }
  await wb.xlsx.writeFile(path.join(outDir, `All Channels - Daily Uploads ${dmy(from)} to ${dmy(to)}.xlsx`));
}
