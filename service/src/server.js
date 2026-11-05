// Small HTTP API used by the n8n workflows (only reachable inside the Docker network).
import http from 'node:http';
import { config } from './config.js';
import { collect, importStatuses, harvestPaths, buildFiles, dailyReport } from './tracker.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const json = (body) => {
  try {
    return JSON.parse(body.toString() || '{}');
  } catch {
    return {};
  }
};

// One job at a time: the hourly and daily workflows can overlap at 9 PM.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const routes = {
  'GET /health': async () => ({ ok: true, model: config.claudeModel, emailTo: config.emailTo.length }),
  'GET /paths': async () => ({ ok: true, paths: harvestPaths().map((path) => ({ path })) }),
  'POST /status': async (req, body) => importStatuses(body),
  'POST /collect': async (req, body) => collect(json(body)),
  'POST /files': async (req, body) => buildFiles(json(body)),
  'POST /report': async (req, body) => dailyReport(json(body)),
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const route = routes[`${req.method} ${url.pathname}`];
    const started = Date.now();
    try {
      if (!route) throw Object.assign(new Error('not found'), { code: 404 });
      const body = await readBody(req);
      const result = await serial(() => route(req, body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      console.log(`${req.method} ${url.pathname} ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`${req.method} ${url.pathname} failed:`, err);
      res.writeHead(err.code === 404 ? 404 : 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  })
  .listen(config.port, () => console.log(`news tracker listening on :${config.port}`));
