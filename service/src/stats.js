// Posting-frequency numbers: does a channel post every hour?
import { ist, clock, hourLabel, todayIst } from './time.js';

export function dayStats(videos, date, now = new Date()) {
  const posts = videos
    .filter((v) => ist(v.postedAt).date === date)
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const v of posts) byHour[ist(v.postedAt).hour]++;

  // Hours that have finished so far (all 24 for past days).
  const hoursElapsed = date === todayIst(now) ? ist(now).hour + 1 : 24;
  const activeHours = byHour.slice(0, hoursElapsed).filter((n) => n > 0).length;

  // Longest run of consecutive elapsed hours with zero posts.
  let gap = { length: 0, from: 0 };
  for (let h = 0, run = 0; h < hoursElapsed; h++) {
    run = byHour[h] === 0 ? run + 1 : 0;
    if (run > gap.length) gap = { length: run, from: h - run + 1 };
  }

  let busiest = -1;
  byHour.forEach((n, h) => {
    if (n > 0 && (busiest < 0 || n > byHour[busiest])) busiest = h;
  });

  // Coverage inside the channel's working window (first post hour → last post hour).
  const first = posts.length ? ist(posts[0].postedAt).hour : 0;
  const last = posts.length ? ist(posts.at(-1).postedAt).hour : 0;
  const window = posts.length ? last - first + 1 : 0;
  const covered = posts.length ? byHour.slice(first, last + 1).filter((n) => n > 0).length : 0;
  const coverage = window ? covered / window : 0;

  let verdict = 'No posts';
  if (posts.length) {
    if (window >= 8 && coverage >= 0.75) verdict = 'Hourly poster';
    else if (posts.length >= 6 || coverage >= 0.4) verdict = 'Regular';
    else verdict = 'Irregular';
  }

  const count = (t) => posts.filter((v) => v.type === t).length;
  return {
    date,
    total: posts.length,
    byHour,
    hoursElapsed,
    activeHours,
    longestGap: gap.length,
    longestGapText: gap.length ? `${gap.length} h (${hourLabel(gap.from).split(' – ')[0]} – ${hourLabel(gap.from + gap.length - 1).split(' – ')[1]})` : '0 h',
    busiestHour: busiest >= 0 ? hourLabel(busiest) : '—',
    busiestCount: busiest >= 0 ? byHour[busiest] : 0,
    firstPost: posts.length ? clock(ist(posts[0].postedAt).hour, ist(posts[0].postedAt).minute) : '—',
    lastPost: posts.length ? clock(ist(posts.at(-1).postedAt).hour, ist(posts.at(-1).postedAt).minute) : '—',
    coveragePct: Math.round(coverage * 100),
    videos: count('Video'),
    shorts: count('Short'),
    lives: count('Live'),
    verdict,
  };
}
