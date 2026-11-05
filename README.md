# YouTube News Tracker

An hourly n8n automation that logs every upload from 4 Telugu news channels (YD News, Vahini News, Siren TV, G News Telugu) into a daily Excel task sheet in OneDrive. Each video gets an English description written by Claude. There's also a posting-frequency report ("are they posting every hour?") and a daily email from Outlook.

**Start here: [SETUP.md](SETUP.md)**

| Path | What it is |
|---|---|
| `docker-compose.yml` | Runs n8n plus the tracker service on the Oracle Cloud free server |
| `.env.example` | Keys to fill in on the server (`.env` is never committed) |
| `n8n/0-backfill-from-nov-1.json` | Run once: builds every day's sheet from 1 Nov 2026 |
| `n8n/1-hourly.json` | Every hour: new videos → task sheets, History files, dashboard |
| `n8n/2-daily-report.json` | 9 PM IST: posting report + top stories emailed from Outlook |
| `service/` | Node.js service: YouTube Data API, Claude summaries, Excel building |

How it fits together: n8n does the scheduling and the Microsoft parts (reading and uploading OneDrive files, sending Outlook mail) through its own Microsoft credentials. The `tracker` service, reachable only inside Docker, does the YouTube API calls, Claude calls, statistics and Excel files.

Developers: run `cd service && npm install && npm test`. Regenerate the workflow files with `node scripts/build-workflows.mjs`.
