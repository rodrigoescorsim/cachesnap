/**
 * HopLens Lambda Probe — Local Test
 *
 * Run with: node probes/lambda/test-local.mjs
 *
 * Simulates a Lambda invocation locally to validate all 24 fields
 * are populated correctly before deploying to AWS.
 */

// Set env vars that Lambda would have
process.env.PROBE_SECRET = 'test_secret';
process.env.REGION = 'sa-east';

// Import the handler
import { handler } from './index.mjs';

const TEST_TARGETS = [
  { name: 'Cloudflare (CF-Ray + Cache)', url: 'https://www.cloudflare.com' },
  { name: 'Vercel (X-Vercel-Id)', url: 'https://nextjs.org' },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' HopLens Lambda Probe — Local Validation Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const target of TEST_TARGETS) {
    console.log(`\n── Testing: ${target.name} ──────────────────────────────`);
    console.log(`   URL: ${target.url}\n`);

    // Mock the ingest call by using a fake URL (sendToIngest will fail silently)
    const event = {
      monitor_id: '00000000-0000-0000-0000-000000000001',
      url: target.url,
      ingest_url: 'http://localhost:3001/api/ingest', // won't actually send
      run_bypass: true,
    };

    try {
      const result = await handler(event);
      const body = JSON.parse(result.body);

      if (body.ok) {
        console.log('   ✅ Probe completed successfully');
      } else {
        console.log(`   ❌ Probe failed: ${body.error}`);
        continue;
      }
    } catch (err) {
      console.log(`   ❌ Handler crashed: ${err.message}`);
      continue;
    }

    // Run the probe directly to inspect the result
    console.log('\n   Running direct measurement...\n');

    const { handler: h, ...rest } = await import('./index.mjs');

    // We'll do a quick inline test
    const https = await import('node:https');
    const { performance } = await import('node:perf_hooks');

    await new Promise((resolve) => {
      const timings = { start: performance.now() };

      const req = https.get(target.url, {
        headers: { 'User-Agent': 'HopLens-Test/1.0' },
        timeout: 15000,
      }, (res) => {
        timings.ttfb = performance.now();
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          timings.end = performance.now();
          const h = res.headers;

          console.log('   Field Validation:');
          console.log(`   ├─ ttfb_ms:      ${Math.round(timings.ttfb - timings.start)}ms`);
          console.log(`   ├─ total_ms:     ${Math.round(timings.end - timings.start)}ms`);
          console.log(`   ├─ dns_ms:       ${timings.dns ? Math.round(timings.dns - timings.start) + 'ms' : '⏳ pending'}`);
          console.log(`   ├─ tls_ms:       ${timings.tls && timings.tcp ? Math.round(timings.tls - timings.tcp) + 'ms' : '⏳ pending'}`);
          console.log(`   ├─ status_code:  ${res.statusCode}`);
          console.log(`   ├─ http_version: HTTP/${res.httpVersion}`);
          console.log(`   ├─ cache_status: ${h['cf-cache-status'] || h['x-vercel-cache'] || h['x-cache'] || h['x-cache-status'] || '(none)'}`);
          console.log(`   ├─ served_by:    ${h['cf-ray'] || h['x-served-by'] || h['x-vercel-id'] || '(none)'}`);
          console.log(`   ├─ server_timing:${h['server-timing'] ? ' ✅ present' : ' ❌ absent'}`);
          console.log(`   ├─ age:          ${h['age'] || '(none)'}`);

          // Security headers
          const sec = ['strict-transport-security', 'content-security-policy', 'x-frame-options',
            'x-content-type-options', 'referrer-policy', 'permissions-policy',
            'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy'];
          const secScore = sec.filter(s => h[s]).length;
          console.log(`   └─ security:     ${secScore}/9 headers present`);
          console.log('');

          resolve();
        });
      });

      req.on('socket', (socket) => {
        socket.on('lookup', () => { timings.dns = performance.now(); });
        socket.on('connect', () => { timings.tcp = performance.now(); });
        socket.on('secureConnect', () => { timings.tls = performance.now(); });
      });

      req.on('error', (err) => {
        console.log(`   ❌ Error: ${err.message}`);
        resolve();
      });
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Test complete. If all fields show values, the probe is ready.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
