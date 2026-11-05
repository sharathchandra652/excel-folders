// Channel list and settings. Edit CHANNELS to track different channels.
export const CHANNELS = [
  { key: 'yd', no: 1, name: 'YD News', handle: '@YDnews116', channelId: 'UCFC3hZfmZqT2zR18J7iRcFA' },
  { key: 'vahini', no: 2, name: 'Vahini News', handle: '@vahinitv', channelId: 'UCI-2yXCW39SxvuZDjt1CfHA' },
  { key: 'siren', no: 3, name: 'Siren TV', handle: '@sirentvnews', channelId: 'UCluDBAoXW5EO98FxqDmIsdw' },
  { key: 'gnews', no: 4, name: 'G News Telugu', handle: '@gnews.telugu', channelId: 'UCkBaRSx5JkioMDqG5TViEIw' },
];

export const config = {
  port: Number(process.env.PORT || 8080),
  dataDir: process.env.DATA_DIR || '/data',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  claudeEffort: process.env.CLAUDE_EFFORT || 'low',
  // Earliest date the tracker collects (IST). The backfill starts here.
  startDate: process.env.START_DATE || '2026-11-01',
  // Folder in OneDrive that holds the 4 channel folders.
  rootFolder: process.env.ONEDRIVE_ROOT || 'News Tracker',
  emailTo: (process.env.REPORT_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Graph sendMail rejects requests over ~4 MB; above this the email carries links only.
  maxAttachmentBytes: Number(process.env.MAX_ATTACHMENT_BYTES || 2_800_000),
  historyDays: Number(process.env.HISTORY_DAYS || 0), // 0 = keep everything
};

export function channelFolder(ch) {
  return `${config.rootFolder}/Channel ${ch.no} (${ch.name})`;
}
