---
name: test-stress
description: >-
  Load, stress, spike, and soak testing — find where a service bends or breaks under pressure and
  where latency/error rates cross the line. Uses k6 (scriptable, low-overhead). Triggers on "load
  test", "stress test", "how much traffic can it handle", "test under pressure", "spike/soak test",
  "will it hold up at launch". Not for single-user functional checks (use test-blackbox/test-user-end).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# test-stress — how it behaves under pressure

Push a real endpoint until you learn its limits: throughput, latency percentiles, and error rate as
concurrency climbs. Part of the `wf-tester` team. Uses **k6** (a small, scriptable load tool); the QA
engine dispatches it as a CLI lane so results fold into the same CTRF/dashboard.

## The four shapes
- **Load** — expected peak concurrency, held steady: does p95 latency and error rate stay within budget?
- **Stress** — ramp past expected peak until it degrades: find the breaking point and *how* it fails (graceful vs falls over).
- **Spike** — a sudden surge then drop: does it absorb and recover?
- **Soak** — moderate load for a long time: memory leaks, connection exhaustion, slow drift.

## How
1. Install k6 (`k6 version`; on the CLI lane the engine calls it — set the target via `MC_QA_TARGET_URL`).
2. Write a k6 script for the key journey (login → primary action), with **thresholds** that make it
   pass/fail: e.g. `http_req_duration: ['p(95)<500']`, `http_req_failed: ['rate<0.01']`.
3. Start small and ramp: `k6 run --vus 10 --duration 30s script.js`, then stages up to your target.
4. Record throughput, p50/p95/p99, error rate, and the concurrency at first degradation. Feed the
   summary into `.skull/qa/` so `skull-dashboard` charts it.

## Safety
Load-test **only** systems you own or are authorized to test, and **only** staging/pre-prod unless
you've cleared production. High load can look like an attack and can cost real money (autoscaling) —
confirm the target and the ceiling with the owner first. Never point a load test at a third party.
