// Builds the Excel task sheets and reads back the Status column the user edits.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config, CHANNELS, channelFolder } from './config.js';
import { ist, dmy, clock, hourLabel, addDays, todayIst } from './time.js';
import { dayStats } from './stats.js';
import { statusOf } from './store.js';

const NAVY = 'FF1F3A5F';
const TYPE_FILL = { Live: 'FFFDE2E1', Short: 'FFE8F0FE', Video: 'FFE6F4EA' };
const thin = { style: 'thin', color: { argb: 'FFD0D7DE' } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const STATUS_LIST = '"New,Reviewed,Done"';

export const dailyName = (ch, date) => `${ch.name} - ${dmy(date)}.xlsx`;
export const historyName = (ch) => `${ch.name} - History.xlsx`;
export const dashboardName = 'All Channels - Dashboard.xlsx';
export const dailyPath = (ch, date) => `${channelFolder(ch)}/${dailyName(ch, date)}`;
export const historyPath = (ch) => `${channelFolder(ch)}/${historyName(ch)}`;
export const dashboardPath = () => `${config.rootFolder}/${dashboardName}`;

const link = (v) => (v.type === 'Short' ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`);

function header(ws, cols) {
  ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
  const row = ws.getRow(1);
  row.height = 26;
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = BORDER;
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function styleRow(row, v) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.alignment = { vertical: 'top', wrapText: true };
    c.border = BORDER;
  });
}

function statusCell(ws, cell) {
  cell.dataValidation = { type: 'list', allowBlank: false, formulae: [STATUS_LIST] };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

function statusColours(ws, col, lastRow) {
  if (lastRow < 2) return;
  const ref = `${col}2:${col}${lastRow}`;
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Done"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Reviewed"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } } } },
    ],
  });
}

async function thumbnail(v) {
  const dir = path.join(config.dataDir, 'thumbs');
  const file = path.join(dir, `${v.id}.jpg`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  try {
    const res = await fetch(v.thumbnail || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buf);
    return buf;
  } catch {
    return null;
  }
}

function hourlyReportSheet(wb, ch, stats, title) {
  const ws = wb.addWorksheet('Hourly Report');
  ws.columns = [{ width: 26 }, { width: 16 }, { width: 44 }];
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } };
  const facts = [
    ['Total posts', stats.total],
    ['Videos / Shorts / Live', `${stats.videos} / ${stats.shorts} / ${stats.lives}`],
    ['Active hours', `${stats.activeHours} of ${stats.hoursElapsed} hours`],
    ['Longest gap with no post', stats.longestGapText],
    ['Busiest hour', stats.busiestCount ? `${stats.busiestHour} (${stats.busiestCount} posts)` : '—'],
    ['First / last post', `${stats.firstPost} / ${stats.lastPost}`],
    ['Verdict', stats.verdict],
  ];
  facts.forEach(([k, val], i) => {
    const r = ws.getRow(3 + i);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = val;
    ws.mergeCells(3 + i, 2, 3 + i, 3);
  });
  const verdictCell = ws.getCell(`B${3 + facts.length - 1}`);
  verdictCell.font = { bold: true, color: { argb: stats.verdict === 'Hourly poster' ? 'FF1E7B34' : stats.verdict === 'Regular' ? 'FF9C6500' : 'FFC00000' } };

  const start = 4 + facts.length;
  ['Hour (IST)', 'Posts', 'Bar'].forEach((h, i) => {
    const c = ws.getRow(start).getCell(i + 1);
    c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.border = BORDER;
  });
  stats.byHour.forEach((n, h) => {
    const r = ws.getRow(start + 1 + h);
    const future = h >= stats.hoursElapsed;
    r.getCell(1).value = hourLabel(h);
    r.getCell(2).value = future ? '' : n;
    r.getCell(3).value = future ? '(not yet)' : '█'.repeat(Math.min(n, 30));
    r.getCell(3).font = { color: { argb: 'FF1F6FB2' } };
    if (!future && n === 0) {
      [1, 2].forEach((i) => (r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E1' } }));
    }
    [1, 2, 3].forEach((i) => (r.getCell(i).border = BORDER));
  });
  ws.getRow(start + 26).getCell(1).value =
    'Red rows = hours with no post. Verdict: "Hourly poster" = posted in at least 75% of the hours between its first and last post (8+ hour window).';
  ws.getRow(start + 26).getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
  ws.mergeCells(start + 26, 1, start + 26, 3);
}

/** Daily task sheet for one channel: S.No · Date · Day · Timings · Title · Description (AI) · Thumbnail · Link · Type · Status */
export async function buildDaily(ch, date, videos, now = new Date()) {
  const rows = videos.filter((v) => ist(v.postedAt).date === date).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'News Tracker';
  const ws = wb.addWorksheet('Task Sheet');
  header(ws, [
    ['S.No', 'sno', 6], ['Date', 'date', 12], ['Day', 'day', 11], ['Timings', 'time', 10], ['Title', 'title', 46],
    ['Description (AI)', 'desc', 50], ['Thumbnail', 'thumb', 25], ['Link', 'link', 13], ['Type', 'type', 8],
    ['Status', 'status', 11], ['Video ID', 'id', 14],
  ]);
  ws.getColumn('id').hidden = true;
  for (const [i, v] of rows.entries()) {
    const t = ist(v.postedAt);
    const row = ws.addRow({
      sno: i + 1, date: dmy(t.date), day: t.day, time: clock(t.hour, t.minute), title: v.title,
      desc: v.summary || '(AI summary pending: added on the next hourly run)', thumb: '',
      link: { text: 'Open video', hyperlink: link(v) }, type: v.type, status: statusOf(v.id), id: v.id,
    });
    row.height = 80;
    styleRow(row, v);
    row.getCell('link').font = { color: { argb: 'FF0563C1' }, underline: true };
    row.getCell('type').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TYPE_FILL[v.type] || 'FFFFFFFF' } };
    row.getCell('sno').alignment = { vertical: 'top', horizontal: 'center' };
    statusCell(ws, row.getCell('status'));
    const img = await thumbnail(v);
    if (img) {
      const imageId = wb.addImage({ buffer: img, extension: 'jpeg' });
      ws.addImage(imageId, { tl: { col: 6.05, row: row.number - 1 + 0.06 }, ext: { width: 168, height: 94 } });
    }
  }
  statusColours(ws, 'J', rows.length + 1);
  ws.autoFilter = { from: 'A1', to: `J${Math.max(rows.length + 1, 1)}` };
  const stats = dayStats(videos, date, now);
  hourlyReportSheet(wb, ch, stats, `${ch.name} · Posting report · ${dmy(date)} (${ist(`${date}T12:00:00Z`).day})`);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), stats, count: rows.length };
}

/** Every video ever logged for the channel, with Days Ago filters and a 30-day posting table. */
export async function buildHistory(ch, videos, now = new Date()) {
  const today = todayIst(now);
  const rows = [...videos].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('All Videos');
  header(ws, [
    ['S.No', 'sno', 6], ['Date', 'date', 12], ['Day', 'day', 11], ['Timings', 'time', 10], ['Days Ago', 'ago', 9],
    ['Title', 'title', 46], ['Description (AI)', 'desc', 50], ['Thumbnail', 'thumb', 24], ['Link', 'link', 13],
    ['Type', 'type', 8], ['Status', 'status', 11], ['Video ID', 'id', 14],
  ]);
  ws.getColumn('id').hidden = true;
  for (const [i, v] of rows.entries()) {
    const t = ist(v.postedAt);
    const rowNo = i + 2;
    const row = ws.addRow({
      sno: rows.length - i, date: new Date(`${t.date}T00:00:00Z`), day: t.day, time: clock(t.hour, t.minute),
      // Live formula so the column stays right without regenerating the file.
      ago: { formula: `TODAY()-B${rowNo}`, result: Math.round((Date.parse(today) - Date.parse(t.date)) / 86400000) },
      title: v.title, desc: v.summary || '',
      // =IMAGE keeps the history file small; it shows pictures in Excel 365, Excel online and the Excel app.
      thumb: { formula: `IMAGE("https://i.ytimg.com/vi/${v.id}/mqdefault.jpg")` },
      link: { text: 'Open video', hyperlink: link(v) }, type: v.type, status: statusOf(v.id), id: v.id,
    });
    row.height = 64;
    styleRow(row, v);
    row.getCell('date').numFmt = 'dd-mm-yyyy';
    row.getCell('link').font = { color: { argb: 'FF0563C1' }, underline: true };
    row.getCell('type').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TYPE_FILL[v.type] || 'FFFFFFFF' } };
    statusCell(ws, row.getCell('status'));
  }
  statusColours(ws, 'K', rows.length + 1);
  ws.autoFilter = { from: 'A1', to: `K${Math.max(rows.length + 1, 1)}` };

  // 30-day posting table
  const ps = wb.addWorksheet('Last 30 Days');
  header(ps, [
    ['Date', 'date', 12], ['Day', 'day', 11], ['Posts', 'total', 8], ['Videos', 'v', 8], ['Shorts', 's', 8], ['Live', 'l', 7],
    ['Active hours', 'active', 12], ['Longest gap', 'gap', 22], ['Busiest hour', 'busy', 18], ['Verdict', 'verdict', 15],
    ['Reviewed/Done', 'done', 14],
  ]);
  const first = rows.length ? ist(rows.at(-1).postedAt).date : today;
  for (let i = 0; i < 30; i++) {
    const date = addDays(today, -i);
    if (date < first) break;
    const s = dayStats(videos, date, now);
    const day = videos.filter((v) => ist(v.postedAt).date === date);
    const done = day.filter((v) => statusOf(v.id) !== 'New').length;
    const row = ps.addRow({
      date: dmy(date), day: ist(`${date}T12:00:00Z`).day, total: s.total, v: s.videos, s: s.shorts, l: s.lives,
      active: `${s.activeHours}/${s.hoursElapsed}`, gap: s.longestGapText, busy: s.busiestHour, verdict: s.verdict,
      done: day.length ? `${done}/${day.length}` : '—',
    });
    styleRow(row);
  }
  ps.getRow(ps.rowCount + 2).getCell(1).value =
    'Tip: on the "All Videos" tab, filter "Days Ago": 1 = yesterday, ≤ 7 = last week, ≤ 30 = last 30 days.';
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}

/** One workbook across all channels: daily counts for 30 days and an hour-by-day heat map per channel. */
export async function buildDashboard(videosByChannel, now = new Date()) {
  const today = todayIst(now);
  const dates = Array.from({ length: 30 }, (_, i) => addDays(today, -i)).filter((d) => d >= config.startDate);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('30-Day Summary');
  ws.getCell('A1').value = 'All channels · last 30 days';
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } };
  const headRow = ws.getRow(3);
  const heads = ['Date', 'Day', ...CHANNELS.flatMap((c) => [`${c.name} posts`, `${c.name} verdict`])];
  heads.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    c.border = BORDER;
  });
  headRow.height = 32;
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 11;
  CHANNELS.forEach((_, i) => {
    ws.getColumn(3 + i * 2).width = 11;
    ws.getColumn(4 + i * 2).width = 15;
  });
  const totals = CHANNELS.map(() => ({ posts: 0, active: 0, days: 0, reviewed: 0 }));
  dates.forEach((date, r) => {
    const row = ws.getRow(4 + r);
    row.getCell(1).value = dmy(date);
    row.getCell(2).value = ist(`${date}T12:00:00Z`).day;
    CHANNELS.forEach((ch, i) => {
      const vids = videosByChannel[ch.key] || [];
      const s = dayStats(vids, date, now);
      row.getCell(3 + i * 2).value = s.total;
      row.getCell(4 + i * 2).value = s.verdict;
      totals[i].posts += s.total;
      totals[i].active += s.activeHours;
      totals[i].days += 1;
      totals[i].reviewed += vids.filter((v) => ist(v.postedAt).date === date && statusOf(v.id) !== 'New').length;
    });
    row.eachCell((c) => (c.border = BORDER));
  });

  const avg = ws.getRow(6 + dates.length);
  avg.getCell(1).value = 'Average per day';
  avg.getCell(1).font = { bold: true };
  CHANNELS.forEach((ch, i) => {
    const t = totals[i];
    avg.getCell(3 + i * 2).value = t.days ? +(t.posts / t.days).toFixed(1) : 0;
    avg.getCell(4 + i * 2).value = t.days ? `${(t.active / t.days).toFixed(1)} active h/day` : '';
  });
  const rev = ws.getRow(7 + dates.length);
  rev.getCell(1).value = 'Reviewed / Done';
  rev.getCell(1).font = { bold: true };
  CHANNELS.forEach((ch, i) => {
    rev.getCell(3 + i * 2).value = totals[i].posts ? `${Math.round((100 * totals[i].reviewed) / totals[i].posts)}%` : '—';
  });

  for (const ch of CHANNELS) {
    const hs = wb.addWorksheet(`Heatmap ${ch.no}`.slice(0, 31));
    hs.getCell('A1').value = `${ch.name}: posts per hour (IST), last 30 days`;
    hs.getCell('A1').font = { bold: true, size: 13, color: { argb: NAVY } };
    hs.getColumn(1).width = 12;
    const hr = hs.getRow(3);
    hr.getCell(1).value = 'Date';
    for (let h = 0; h < 24; h++) {
      hr.getCell(2 + h).value = hourLabel(h).split(' – ')[0];
      hs.getColumn(2 + h).width = 6;
    }
    hr.eachCell((c) => {
      c.font = { bold: true, size: 9 };
      c.alignment = { horizontal: 'center' };
    });
    const vids = videosByChannel[ch.key] || [];
    dates.forEach((date, r) => {
      const s = dayStats(vids, date, now);
      const row = hs.getRow(4 + r);
      row.getCell(1).value = dmy(date);
      s.byHour.forEach((n, h) => {
        const c = row.getCell(2 + h);
        if (h >= s.hoursElapsed) return;
        c.value = n;
        c.alignment = { horizontal: 'center' };
        const shade = n === 0 ? 'FFFFFFFF' : n === 1 ? 'FFCFE2F3' : n <= 3 ? 'FF9FC5E8' : n <= 6 ? 'FF3D85C6' : 'FF0B5394';
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
        if (n > 3) c.font = { color: { argb: 'FFFFFFFF' } };
        c.border = BORDER;
      });
    });
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}

/** Reads "Video ID" + "Status" pairs back out of a task sheet the user edited. */
export async function readStatuses(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = [];
  wb.eachSheet((ws) => {
    const head = ws.getRow(1);
    let idCol = 0;
    let stCol = 0;
    head.eachCell((c, n) => {
      if (c.value === 'Video ID') idCol = n;
      if (c.value === 'Status') stCol = n;
    });
    if (!idCol || !stCol) return;
    ws.eachRow((row, r) => {
      if (r === 1) return;
      const id = String(row.getCell(idCol).value || '').trim();
      const st = String(row.getCell(stCol).value || '').trim();
      if (id && ['New', 'Reviewed', 'Done'].includes(st)) out.push({ id, status: st });
    });
  });
  return out;
}
