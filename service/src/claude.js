// Claude writes the English "Description (AI)" for each video and the daily digest.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { config } from './config.js';

let client;
const anthropic = () => (client ||= new Anthropic()); // reads ANTHROPIC_API_KEY

const SummarySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      category: z.string(),
    }),
  ),
});

const SYSTEM = `You summarise Telugu YouTube news videos for a media analyst who reads English.
For each video you get its title and the channel's description (often mostly hashtags).
Write "summary": 1-2 plain English sentences saying what the video is about: who, what, where.
Translate names and places into English spelling. Do not invent facts that the title and description do not support.
If the same clip is clearly a repost, still summarise it and add "(Repost.)" at the end.
"category": one of Politics, Elections, Irrigation, Crime, Courts, Health, Govt schemes, Society, Environment, Event, Headlines, Entertainment, Other.
Return one item per input video, using the same id.`;

/** Adds summary + category to each video. Videos are sent in batches of 25. */
export async function summarise(videos, channelName) {
  const result = new Map();
  for (let i = 0; i < videos.length; i += 25) {
    const batch = videos.slice(i, i + 25).map((v) => ({
      id: v.id,
      type: v.type,
      title: v.title,
      description: v.description.replace(/https?:\/\/\S+/g, '').slice(0, 1500),
    }));
    try {
      const res = await anthropic().messages.parse({
        model: config.claudeModel,
        max_tokens: 16000,
        output_config: { effort: config.claudeEffort, format: zodOutputFormat(SummarySchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Channel: ${channelName}\nVideos:\n${JSON.stringify(batch, null, 1)}` }],
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined this batch');
      for (const item of res.parsed_output?.items || []) result.set(item.id, item);
    } catch (err) {
      console.error(`[claude] summary batch failed for ${channelName}:`, err.message);
    }
  }
  return videos.map((v) => {
    const s = result.get(v.id);
    return s ? { ...v, summary: s.summary, category: s.category } : v; // retried on the next run
  });
}

const DigestSchema = z.object({
  channels: z.array(z.object({ channel: z.string(), topStories: z.string() })),
  commonThemes: z.array(z.string()),
});

/** One short digest per channel plus themes shared across channels, for one day. */
export async function digest(date, perChannel) {
  const input = perChannel.map((c) => ({
    channel: c.name,
    videos: c.videos.map((v) => `${v.time} [${v.type}] ${v.summary || v.title}`),
  }));
  try {
    const res = await anthropic().messages.parse({
      model: config.claudeModel,
      max_tokens: 16000,
      output_config: { effort: config.claudeEffort, format: zodOutputFormat(DigestSchema) },
      system:
        'You write a short daily news digest in plain English for a media analyst tracking Telugu YouTube news channels. ' +
        'For each channel, "topStories" is 2-4 sentences naming the main stories it covered that day (mention heavy reposting if any). ' +
        '"commonThemes" lists 2-5 stories covered by more than one channel, one sentence each, naming the channels. ' +
        'Only use what the video list says.',
      messages: [{ role: 'user', content: `Date: ${date}\n${JSON.stringify(input, null, 1)}` }],
    });
    return res.parsed_output;
  } catch (err) {
    console.error('[claude] digest failed:', err.message);
    return null;
  }
}
