import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-'));
const { dayStats } = await import('../src/stats.js');
const { ist, istMidnight, clock } = await import('../src/time.js');
const { buildDaily, readStatuses } = await import('../src/excel.js');
const store = await import('../src/store.js');
const { CHANNELS } = await import('../src/config.js');

// 2026-11-04 IST hours -> UTC instants
const at = (h, m = 0) => new Date(istMidnight('2026-11-04').getTime() + (h * 60 + m) * 60e3).toISOString();
const vid = (id, h, m, type = 'Video') => ({ id, channel: 'yd', title: `t${id}`, description: '', postedAt: at(h, m), type, summary: `s${id}` });

test('IST conversion', () => {
  assert.deepEqual(ist('2026-11-04T18:30:00Z'), { date: '2026-11-05', hour: 0, minute: 0, day: 'Thursday' });
  assert.equal(clock(16, 53), '04:53 PM');
  assert.equal(clock(0, 5), '12:05 AM');
});

test('hourly stats and verdict', () => {
  const vids = [];
  for (let h = 8; h <= 20; h++) if (h !== 13) vids.push(vid(`a${h}`, h, 10));
  vids.push(vid('x', 9, 40, 'Short'));
  const s = dayStats(vids, '2026-11-04', new Date('2026-11-06T00:00:00Z'));
  assert.equal(s.total, 13);
  assert.equal(s.activeHours, 12);
  assert.equal(s.byHour[9], 2);
  assert.equal(s.longestGap, 8); // midnight to 8 AM
  assert.equal(s.verdict, 'Hourly poster');
  assert.equal(s.shorts, 1);
  const sparse = dayStats([vid('b', 9, 0), vid('c', 20, 0)], '2026-11-04', new Date('2026-11-06T00:00:00Z'));
  assert.equal(sparse.verdict, 'Irregular');
});

test('today only counts elapsed hours', () => {
  const s = dayStats([vid('a', 1, 0)], '2026-11-04', new Date(at(5, 30)));
  assert.equal(s.hoursElapsed, 6);
  assert.equal(s.activeHours, 1);
});

test('daily sheet round-trips the Status column', async () => {
  store.useMemoryStore({ videos: {}, status: { b: 'Done' } });
  const vids = [vid('a', 10, 0), vid('b', 11, 5, 'Short')];
  const { buffer, count } = await buildDaily(CHANNELS[0], '2026-11-04', vids, new Date('2026-11-06T00:00:00Z'));
  assert.equal(count, 2);
  const statuses = await readStatuses(buffer);
  assert.deepEqual(statuses, [{ id: 'a', status: 'New' }, { id: 'b', status: 'Done' }]);
});
