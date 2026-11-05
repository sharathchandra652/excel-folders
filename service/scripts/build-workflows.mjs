// Generates the importable n8n workflow files in ../n8n and checks their wiring.
// Run: node scripts/build-workflows.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'n8n');
const TRACKER = 'http://tracker:8080';
const GRAPH_ITEM = (expr) =>
  `={{ 'https://graph.microsoft.com/v1.0/me/drive/root:/' + ${expr}.split('/').map(encodeURIComponent).join('/') + ':/content' }}`;
const ONEDRIVE = { microsoftOneDriveOAuth2Api: { id: '', name: 'Microsoft OneDrive account' } };
const OUTLOOK = { microsoftOutlookOAuth2Api: { id: '', name: 'Microsoft Outlook account' } };

let x = 0;
const node = (name, type, typeVersion, parameters, extra = {}) => ({
  id: crypto.randomUUID(),
  name, type, typeVersion, position: [(x += 240), 300], parameters, ...extra,
});
const http = (name, parameters, extra) => node(name, 'n8n-nodes-base.httpRequest', 4.2, { options: { timeout: 900000 }, ...parameters }, extra);
const trackerPost = (name, jsonBody, extra) =>
  http(name, { method: 'POST', url: `${TRACKER}${extra?.path}`, sendBody: true, specifyBody: 'json', jsonBody }, { executeOnce: true, ...extra?.node });

function harvestAndUpload() {
  return [
    http('Get sheet paths', { url: `${TRACKER}/paths` }, { executeOnce: true }),
    node('Split paths', 'n8n-nodes-base.splitOut', 1, { fieldToSplitOut: 'paths', options: {} }),
    http('Download sheet from OneDrive', {
      url: GRAPH_ITEM('$json.path'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'microsoftOneDriveOAuth2Api',
      options: { timeout: 120000, response: { response: { responseFormat: 'file', neverError: true } } },
    }, { credentials: ONEDRIVE, notes: 'Reads back the Status column you edited. A missing file (first run) is fine.' }),
    http('Import Status column', {
      method: 'POST', url: `${TRACKER}/status`, sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data',
    }, { continueOnFail: true }),
  ];
}

function upload() {
  return [
    node('Split files', 'n8n-nodes-base.splitOut', 1, { fieldToSplitOut: 'files', options: {} }),
    node('Make Excel file', 'n8n-nodes-base.convertToFile', 1.1, {
      operation: 'toBinary', sourceProperty: 'base64',
      options: { fileName: '={{ $json.name }}', mimeType: '={{ $json.mimeType }}' },
    }),
    http('Upload to OneDrive', {
      method: 'PUT',
      url: GRAPH_ITEM("$('Split files').item.json.path"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'microsoftOneDriveOAuth2Api',
      sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data',
      options: { timeout: 300000 },
    }, { credentials: ONEDRIVE, continueOnFail: true, notes: 'Creates the channel folders automatically. Fails only for a file that is open and locked; the next run retries.' }),
  ];
}

function chain(nodes) {
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) {
    connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  }
  return connections;
}

function workflow(name, nodes, note) {
  x = 0;
  nodes.forEach((n, i) => (n.position = [i * 240, 300]));
  nodes.unshift({
    id: crypto.randomUUID(), name: 'Read me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [0, 0], parameters: { content: note, width: 520, height: 200 },
  });
  return {
    name,
    nodes,
    connections: chain(nodes.slice(1)),
    settings: { timezone: 'Asia/Kolkata', executionOrder: 'v1', saveManualExecutions: true },
    active: false,
    pinData: {},
    tags: [],
  };
}

const collect = (body) => trackerPost('Collect new videos', body, { path: '/collect' });
const files = (body) => trackerPost('Build Excel files', body, { path: '/files' });

const hourly = workflow('News Tracker · Hourly', [
  node('Every hour', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '5 * * * *' }] } }),
  ...harvestAndUpload(),
  collect('={}'),
  files('={}'),
  ...upload(),
], '## Hourly\nAt 5 past every hour (IST): reads your Status edits from OneDrive, fetches new uploads from the 4 channels, Claude writes the descriptions, then uploads today\'s 4 task sheets, the 4 History files and the dashboard.');

const daily = workflow('News Tracker · Daily Report 9 PM', [
  node('Every day 9 PM', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 21 * * *' }] } }),
  ...harvestAndUpload(),
  collect('={}'),
  files('={}'),
  ...upload(),
  http('Get OneDrive folder link', {
    url: "={{ 'https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeURIComponent('News Tracker') }}",
    authentication: 'predefinedCredentialType', nodeCredentialType: 'microsoftOneDriveOAuth2Api',
    options: { timeout: 60000, response: { response: { neverError: true } } },
  }, { credentials: ONEDRIVE, executeOnce: true }),
  trackerPost('Build report email', '={{ JSON.stringify({ webUrl: $json.webUrl }) }}', { path: '/report' }),
  http('Send email (Outlook)', {
    method: 'POST', url: 'https://graph.microsoft.com/v1.0/me/sendMail',
    authentication: 'predefinedCredentialType', nodeCredentialType: 'microsoftOutlookOAuth2Api',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.sendMail) }}',
    options: { timeout: 120000 },
  }, { credentials: OUTLOOK, executeOnce: true }),
], '## Daily report\nAt 9 PM IST: same update as the hourly run, then emails the posting report, Claude\'s top stories and the 4 task sheets from your Outlook to REPORT_EMAIL.');

const backfill = workflow('News Tracker · Backfill from 1 Nov (run once)', [
  node('Run once by hand', 'n8n-nodes-base.manualTrigger', 1, {}),
  collect('={{ JSON.stringify({ since: "2026-11-01" }) }}'),
  files('={{ JSON.stringify({ from: "2026-11-01" }) }}'),
  ...upload(),
], '## Backfill\nRun this once after setup. It collects every upload since 1 Nov 2026 and creates a task sheet for each day (1 Nov → today) in each channel folder. Takes a few minutes.');

fs.mkdirSync(outDir, { recursive: true });
for (const [file, wf] of [['1-hourly.json', hourly], ['2-daily-report.json', daily], ['0-backfill-from-nov-1.json', backfill]]) {
  const names = new Set(wf.nodes.map((n) => n.name));
  if (names.size !== wf.nodes.length) throw new Error(`${file}: duplicate node names`);
  for (const [from, c] of Object.entries(wf.connections)) {
    if (!names.has(from)) throw new Error(`${file}: unknown source ${from}`);
    for (const out of c.main.flat()) if (!names.has(out.node)) throw new Error(`${file}: unknown target ${out.node}`);
  }
  for (const n of wf.nodes) {
    const exprs = JSON.stringify(n.parameters).match(/\$\('([^']+)'\)/g) || [];
    for (const e of exprs) if (!names.has(e.slice(3, -2))) throw new Error(`${file}: ${n.name} references missing node ${e}`);
  }
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(wf, null, 2)}\n`);
  console.log(`wrote n8n/${file} (${wf.nodes.length} nodes)`);
}
