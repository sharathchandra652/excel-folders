# Daily report: instructions for the Claude Code session

The scheduled task runs these steps once a day (11:30 PM IST). No server, n8n or Anthropic API key is needed. It only needs `YOUTUBE_API_KEY` in the environment and `www.googleapis.com` allowed.

1. `cd service && npm ci --no-audit --no-fund && cd ..`
2. `node service/scripts/daily.mjs collect`. This fetches new uploads into `reports/data/videos.json`. The first run starts at 1 Nov 2026.
3. `node service/scripts/daily.mjs pending > /tmp/pending.json`. Then write `/tmp/summaries.json` as `[{ "id", "summary", "category" }]` for every pending video:
   - **summary:** 1–2 plain English sentences on what the video is about (who, what, where), based only on its Telugu title and description. Add "(Repost.)" for an obvious repeat clip.
   - **category:** one of Politics, Elections, Irrigation, Crime, Courts, Health, Govt schemes, Society, Environment, Event, Headlines, Entertainment, Other.
4. `node service/scripts/daily.mjs apply /tmp/summaries.json`
5. `node service/scripts/daily.mjs build`. This writes `reports/Channel N (…)/<Channel> - DD-MM-YYYY.xlsx` for every day, plus each channel's History file and `reports/All Channels - Dashboard.xlsx`.
6. `node service/scripts/engagement.mjs 2026-11-01`. This refreshes `daily excels/`: one `Engagement - DD-MM-YYYY.xlsx` per day (views, likes, comments, comment mood, response) and `All Channels - Daily Uploads 01-11-2026 to DD-MM-YYYY.xlsx` (every upload per channel, day by day; the older copy is removed).
7. Commit `reports/` and `daily excels/` to `main` with the message `Daily report DD-MM-YYYY`, then push.

Each daily file: a **Task Sheet** grouped hour by hour (S.No, Date, Day, Timings, Title, Description (AI), Thumbnail, Link, Type, Status; hours with no post in red), and an **Hourly Report** tab (totals, live count, active hours, longest gap, verdict).
