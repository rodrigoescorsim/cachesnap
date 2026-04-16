/**
 * Quick diagnostic: Run the actual handler and inspect the result object.
 */
process.env.PROBE_SECRET = 'test_secret';
process.env.REGION = 'sa-east';

import { handler } from './index.mjs';

// Override sendToIngest by intercepting — we'll capture the result
// by pointing ingest to a non-existent URL and checking what the handler
// produces internally. Instead, let's modify approach: call measureUrl directly.

// Actually, the cleanest way: create a tiny HTTP server to capture the ingest payload.
import http from 'node:http';

const captured = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    captured.push(JSON.parse(body));
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
});

await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

console.log('═══════════════════════════════════════════════════');
console.log(' cachesnap Lambda Probe — Full Field Diagnostic');
console.log('═══════════════════════════════════════════════════\n');

const targets = [
  { name: 'Cloudflare', url: 'https://www.cloudflare.com' },
  { name: 'Vercel/Next.js', url: 'https://nextjs.org' },
];

for (const t of targets) {
  console.log(`\n── ${t.name} (${t.url}) ──\n`);

  await handler({
    monitor_id: '00000000-0000-0000-0000-000000000001',
    url: t.url,
    ingest_url: `http://127.0.0.1:${port}/api/ingest`,
    run_bypass: true,
  });

  const result = captured.pop();
  if (!result) {
    console.log('  ❌ No result captured');
    continue;
  }

  // Print every field with status
  const fields = [
    'monitor_id', 'region',
    'ttfb_ms', 'download_ms', 'total_ms',
    'dns_ms', 'tls_ms',
    'edge_ms', 'origin_ms',
    'status_code', 'cache_status', 'served_by', 'cdn_provider',
    'server_timing', 'http_version',
    'redirect_count', 'content_length', 'error',
    'bypass_ttfb_ms', 'bypass_total_ms', 'bypass_status_code', 'bypass_error',
    'age_s', 'security_headers', 'server_timing_breakdown',
  ];

  for (const f of fields) {
    const val = result[f];
    const display = val === null ? 'null' :
      typeof val === 'object' ? JSON.stringify(val) :
      String(val);
    const icon = val !== null && val !== undefined ? '✅' : '⬜';
    console.log(`  ${icon} ${f.padEnd(28)} ${display}`);
  }
}

server.close();
console.log('\n═══════════════════════════════════════════════════');
console.log(' Done.');
console.log('═══════════════════════════════════════════════════\n');
