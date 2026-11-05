// Daily report without a server: run inside a Claude Code session.
//
//   node service/scripts/daily.mjs collect            fetch uploads (from START_DATE or the last run) into reports/data/videos.json
//   node service/scripts/daily.mjs pending            print videos still missing an English summary (JSON) to stdout
//   node service/scripts/daily.mjs apply <file.json>  merge summaries: [{ "id", "summary", "category" }]
//   node service/scripts/daily.mjs build [from]       write reports/Channel N (…)/<Channel> - DD-MM-YYYY.xlsx, History, Dashboard
//
// The Claude session writes the summaries itself (no Anthropic API key needed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.DATA_DIR ||= path.join(repo, 'reports', 'data');
process.env.ONEDRIVE_ROOT ||= 'reports';

const { CHANNELS, config } = await import('../src/config.js');
const store = await import('../src/store.js');
const { uploadsSince, details } = await import('../src/youtube.js');
const { istMidnight, todayIst } = await import('../src/time.js');
const { buildFiles } = await import('../src/tracker.js');

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'collect') {
  if (!config.youtubeApiKey) throw new Error('YOUTUBE_API_KEY is not set in this environment');
  for (const ch of CHANNELS) {
    const known = store.videosFor(ch.key);
    const from = arg ? istMidnight(arg)
      : known.length ? new Date(Date.parse(known.at(-1).postedAt) - 6 * 3600e3) : istMidnight(config.startDate);
    const floor = istMidnight(config.startDate);
    const ids = await uploadsSince(ch.channelId, from < floor ? floor : from);
    const fresh = ids.filter((id) => !store.load().videos[id]);
    // Keep the summary already written when a known video is fetched again.
    const vids = (await details(fresh, ch.key)).filter((v) => new Date(v.postedAt) >= floor);
    store.upsertVideos(vids);
    console.log(`${ch.name}: ${ids.length} checked, ${vids.length} new`);
  }
} else if (cmd === 'pending') {
  const out = Object.values(store.load().videos)
    .filter((v) => !v.summary)
    .map((v) => ({ id: v.id, channel: v.channel, type: v.type, title: v.title, description: v.description.replace(/https?:\/\/\S+/g, '').slice(0, 600) }));
  console.log(JSON.stringify(out, null, 1));
} else if (cmd === 'apply') {
  const items = JSON.parse(fs.readFileSync(arg, 'utf8'));
  const db = store.load();
  let n = 0;
  for (const { id, summary, category } of items) {
    if (db.videos[id] && summary) {
      db.videos[id].summary = summary;
      db.videos[id].category = category || db.videos[id].category;
      n++;
    }
  }
  store.save();
  console.log(`applied ${n} summaries`);
} else if (cmd === 'build') {
  const now = new Date();
  const to = todayIst(now);
  const { files } = await buildFiles({ from: arg || config.startDate, to, now });
  for (const f of files) {
    const dest = path.join(repo, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(f.base64, 'base64'));
  }
  console.log(`wrote ${files.length} files under reports/ (up to ${to}); channels: ${CHANNELS.map((c) => c.name).join(', ')}`);
} else {
  console.log('usage: collect [from] | pending | apply <file> | build [from]');
}
