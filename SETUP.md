# YouTube News Tracker: setup guide

Every hour this automation checks 4 Telugu news channels on YouTube. Each new video (Video, Short or Live) gets a row in that day's Excel task sheet, and Claude writes an English description of it. Every night at 9 PM a report goes to your email.

| Channel folder in OneDrive | YouTube |
|---|---|
| `News Tracker/Channel 1 (YD News)` | youtube.com/@YDnews116 |
| `News Tracker/Channel 2 (Vahini News)` | youtube.com/@vahinitv |
| `News Tracker/Channel 3 (Siren TV)` | youtube.com/@sirentvnews |
| `News Tracker/Channel 4 (G News Telugu)` | youtube.com/@gnews.telugu |

## What lands in OneDrive

```
News Tracker/
├── All Channels - Dashboard.xlsx          ← 30-day posting summary + hour-by-day heat maps
├── Channel 1 (YD News)/
│   ├── YD News - History.xlsx             ← every video ever, filter: yesterday / last week / last 30 days
│   ├── YD News - 01-11-2026.xlsx          ← one task sheet per day
│   ├── YD News - 02-11-2026.xlsx
│   └── …
├── Channel 2 (Vahini News)/ …
├── Channel 3 (Siren TV)/ …
└── Channel 4 (G News Telugu)/ …
```

Each daily file has 2 tabs:

- **Task Sheet:** grouped hour by hour. Each hour has a header row ("4 PM – 5 PM · 5 posts", red when nothing was posted), followed by that hour's videos: S.No · Date · Day · Timings · Title · Description (AI) · Thumbnail · Link · Type · Status
- **Hourly Report:** posts in each of the 24 hours (red means nothing was posted that hour), total posts, active hours, longest gap, busiest hour, and a verdict: **Hourly poster / Regular / Irregular**

**Status:** set each row to New, Reviewed or Done in OneDrive or Excel. The next hourly run reads it back and keeps it, including in the History file. Setting a row back to "New" isn't remembered; only Reviewed and Done are.

---

## Step 1: Get 3 keys and 1 Microsoft app (about 30 minutes, once)

Write each key into a notepad on your PC. **Don't share these keys with anyone, and don't paste them into chats.**

### 1a. YouTube Data API key (free)
1. Go to https://console.cloud.google.com and sign in with any Google account.
2. Create a new project, named e.g. "News Tracker".
3. Go to **APIs & Services → Library**, search for **YouTube Data API v3**, and click **Enable**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**. Copy the key.

### 1b. Anthropic (Claude) API key
1. Go to https://console.anthropic.com, sign up and add a small amount of credit (e.g. $5).
2. Go to **API Keys → Create key**. Copy it.

### 1c. Microsoft app (lets n8n use your OneDrive and Outlook)
1. Go to https://portal.azure.com and sign in with **your Outlook account**. It's free; skip any subscription prompts.
2. Search for **App registrations**, then click **New registration**.
   - Name: `News Tracker`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: platform **Web**, value `http://localhost:5678/rest/oauth2-credential/callback`
3. Click **Register**. Copy the **Application (client) ID**.
4. Go to **Certificates & secrets → New client secret** and pick 24 months. Copy the **Value** right away; it's only shown once.

---

## Step 2: Create the free Oracle server (about 20 minutes)

1. Sign up at https://www.oracle.com/cloud/free/. A card is needed for verification. Always Free resources don't cost anything.
2. Go to **Compute → Instances → Create instance**.
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, 1 OCPU, 6 GB memory. This is within Always Free.
   - **Download the private SSH key** (a `.key` file). Save it on your PC, e.g. `C:\Users\<you>\oracle.key`.
3. Click **Create**. When it shows "Running", copy the **Public IP address**.

> If Oracle says "Out of capacity" for Ampere, try again later or choose another availability domain. This is common and temporary.

---

## Step 3: Install the automation on the server

Open **PowerShell** on Windows (or Terminal on Mac) and connect:

```bash
ssh -i C:\Users\<you>\oracle.key ubuntu@<PUBLIC-IP>
```

Then, on the server, paste these one at a time:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
```

```bash
sudo usermod -aG docker ubuntu && exit
```

Reconnect with the same `ssh` command, then:

```bash
git clone https://github.com/sharathchandra652/excel-folders.git && cd excel-folders
```

> If the repository is private, Git asks for a username and password. Use your GitHub username and a [personal access token](https://github.com/settings/tokens) as the password.

```bash
cp .env.example .env && nano .env
```

Fill in `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY` and `REPORT_EMAIL` (your email). For `N8N_ENCRYPTION_KEY`, paste the output of `openssl rand -hex 32`. Save with **Ctrl+O, Enter**, then exit with **Ctrl+X**.

```bash
docker compose up -d --build
```

To check that it's running, run the following. Both lines should say `Up`.

```bash
docker compose ps
```

---

## Step 4: Open n8n and connect Microsoft

n8n is only reachable through a secure tunnel, so nobody else on the internet can open it. On **your PC**, open a new PowerShell window:

```bash
ssh -i C:\Users\<you>\oracle.key -L 5678:localhost:5678 ubuntu@<PUBLIC-IP>
```

Keep that window open, then go to **http://localhost:5678** in your browser and create your n8n owner account.

Add two credentials (**Credentials → Add credential**):

1. **Microsoft OneDrive OAuth2 API**: paste the Client ID and Client Secret from step 1c, click **Connect**, and sign in with your Outlook account.
2. **Microsoft Outlook OAuth2 API**: the same Client ID and Secret, then click **Connect**.

---

## Step 5: Import the workflows and start

1. In n8n, go to **Workflows → Add workflow → ⋯ → Import from file**, and import these 3 files from the `n8n/` folder of this project (download them from GitHub to your PC first):
   - `0-backfill-from-nov-1.json`
   - `1-hourly.json`
   - `2-daily-report.json`
2. In each workflow, open every node with a Microsoft icon or "OneDrive"/"Outlook" in its name and pick the credential you created. Save.
3. Open **Backfill from 1 Nov** and click **Execute workflow**. After a few minutes, OneDrive has the 4 channel folders with a task sheet for every day since 1 Nov, plus the History files and the dashboard.
4. Open **Hourly** and **Daily Report 9 PM** and switch each to **Active** (top right).

That's it. Your PC can be off; the Oracle server does everything.

---

## Daily use

- **Today's sheet:** open `Channel N (…)/<Channel> - <today>.xlsx`. It gets new rows every hour.
- **Is the channel posting every hour?** Look at the **Hourly Report** tab in the daily file, or the dashboard for the last 30 days.
- **Yesterday, last week or last 30 days:** open `<Channel> - History.xlsx` and filter the **Days Ago** column. Use 1 for yesterday, ≤ 7 for last week and ≤ 30 for the last 30 days. The **Last 30 Days** tab shows one line per day.
- **Sharing:** in OneDrive, right-click the `News Tracker` folder, choose **Share**, and set it to "Can view". Anyone with the link can see everything; only you can edit.
- **Thumbnails:** daily files have the pictures built in. History files use Excel's `IMAGE()` function to stay small, so the pictures show in Excel 365, Excel online and the Excel phone app, but not in old Excel versions.

## Costs

| Item | Cost |
|---|---|
| Oracle server, n8n, YouTube API, OneDrive, Outlook | Free |
| Claude with `claude-opus-5-5` (default) | about $10–20 a month for ~150 videos a day |
| Claude with `claude-haiku-5-5` | under $1 a month |

To use the cheaper model, set `CLAUDE_MODEL=claude-haiku-5-5` in `.env`, then run `docker compose up -d`. The summaries will be a little less polished.

## Troubleshooting

- **See what happened:** in n8n, open **Executions**. Red means a step failed; click it to see why.
- **Service logs (on the server):**

  ```bash
  docker compose logs tracker --tail 50
  ```

- **"YOUTUBE_API_KEY is not set":** fix `.env`, then run `docker compose up -d`.
- **A file didn't update:** if it was open in desktop Excel, OneDrive may lock it. The next hourly run retries.
- **Add or change a channel:** edit `service/src/config.js` (name, handle, channel ID), then run `docker compose up -d --build`.
- **Update to a newer version of this project:** run `git pull`, then `docker compose up -d --build`.
