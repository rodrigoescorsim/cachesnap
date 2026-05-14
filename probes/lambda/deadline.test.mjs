/**
 * Unit tests for the Deadline class inside the Lambda probe.
 *
 * Run with:   node --test probes/lambda/deadline.test.mjs
 *
 * Uses Node's built-in test runner (Node 20+) so the Lambda directory stays
 * dependency-free — exactly the same runtime used by AWS in production.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { Deadline } from './index.mjs';

test('remainingMs starts at the configured limit (allowing tiny clock drift)', () => {
  const d = new Deadline(1000);
  const remaining = d.remainingMs();
  assert.ok(remaining > 990 && remaining <= 1000, `expected ~1000, got ${remaining}`);
});

test('elapsedMs grows after sleeping', async () => {
  const d = new Deadline(1000);
  await sleep(50);
  const elapsed = d.elapsedMs();
  assert.ok(elapsed >= 40, `expected ≥40ms elapsed, got ${elapsed}`);
});

test('exceeded(0) is false before deadline, true after', async () => {
  const d = new Deadline(60);
  assert.equal(d.exceeded(0), false);
  await sleep(120);
  assert.equal(d.exceeded(0), true);
});

test('exceeded(minRequired) detects "not enough budget for a new phase"', async () => {
  const d = new Deadline(500);
  // 500ms total budget, sleep 200ms → ~300ms remain.
  await sleep(200);
  assert.equal(d.exceeded(400), true, 'should skip phases needing 400ms');
  assert.equal(d.exceeded(10), false, 'should still accept phases needing 10ms');
});

test('effectiveTimeoutMs picks the smaller of (cap, remaining)', () => {
  const d = new Deadline(10_000);
  // Remaining ≈ 10_000ms; cap = 5_000ms → effective = 5_000ms.
  const t = d.effectiveTimeoutMs(5_000);
  assert.ok(t >= 4_990 && t <= 5_000, `expected ~5000, got ${t}`);
});

test('effectiveTimeoutMs returns the remaining budget when cap is larger', async () => {
  const d = new Deadline(200);
  await sleep(150);
  // Remaining ≈ 50ms; cap = 30_000ms → effective ≈ 50ms.
  const t = d.effectiveTimeoutMs(30_000);
  assert.ok(t > 0 && t <= 80, `expected ~50ms, got ${t}`);
});

test('effectiveTimeoutMs never returns 0 (Node http rejects 0-ms timeouts)', async () => {
  const d = new Deadline(20);
  await sleep(50);
  const t = d.effectiveTimeoutMs(30_000);
  assert.ok(t >= 1, `expected ≥1, got ${t}`);
});

test('remainingMs goes negative once the deadline has been crossed', async () => {
  const d = new Deadline(20);
  await sleep(80);
  assert.ok(d.remainingMs() < 0, `expected negative, got ${d.remainingMs()}`);
});

test('effectiveTimeoutMs still returns ≥1ms when remaining is negative', async () => {
  const d = new Deadline(20);
  await sleep(80);
  const t = d.effectiveTimeoutMs(5_000);
  assert.ok(t >= 1, `expected ≥1ms (clamped), got ${t}`);
});

test('a fresh Deadline does not consider itself exceeded', () => {
  const d = new Deadline(5_000);
  assert.equal(d.exceeded(4_000), false);
  assert.equal(d.exceeded(0), false);
});
