import assert from 'node:assert/strict';
import test from 'node:test';
import type { Checklist, StatusFile } from '@mc-qa/core';
import { computeReleaseVerdict } from './verdict.ts';

// One gate section (g) + one non-gate section (n). Verdict scope is the two tasks unless the
// caller narrows it with plannedTaskIds.
const checklist: Checklist = {
  schemaVersion: '1.0',
  service: 'demo',
  title: 'demo',
  sections: [
    { id: 'g', title: 'gate', gate: true, tasks: ['svc.smoke.001'] },
    { id: 'n', title: 'non-gate', tasks: ['svc.extra.001'] },
  ],
};

function statusOf(tasks: Record<string, StatusFile['tasks'][string]['status']>): StatusFile {
  const out: StatusFile = { envProfile: 'e', updatedAt: '', tasks: {} };
  for (const [id, status] of Object.entries(tasks)) out.tasks[id] = { status, runId: 'r', at: '' };
  return out;
}

test('gate-fail wins even with outstanding items', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'failed', 'svc.extra.001': 'skipped-needs-human' }),
  );
  assert.equal(v.release, 'fail');
  assert.deepEqual(v.failedGateSections, [{ section: 'g', tasks: ['svc.smoke.001'] }]);
});

test('clean + outstanding ⇒ incomplete', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'passed', 'svc.extra.001': 'skipped-needs-human' }),
  );
  assert.equal(v.release, 'incomplete');
  assert.deepEqual(v.outstanding.needsHuman, ['svc.extra.001']);
});

test('pending-review and blocked count as outstanding', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'pending-review', 'svc.extra.001': 'blocked' }),
  );
  assert.equal(v.release, 'incomplete');
  assert.deepEqual(v.outstanding.pendingReview, ['svc.smoke.001']);
  assert.deepEqual(v.outstanding.blocked, ['svc.extra.001']);
});

test('clean + nothing outstanding ⇒ pass', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'passed', 'svc.extra.001': 'passed' }),
  );
  assert.equal(v.release, 'pass');
  assert.equal(v.outstanding.needsHuman.length + v.outstanding.pendingReview.length + v.outstanding.blocked.length, 0);
});

test('quarantined and skipped-risk-gate are never outstanding ⇒ pass', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'quarantined', 'svc.extra.001': 'skipped-risk-gate' }),
  );
  assert.equal(v.release, 'pass');
  assert.deepEqual(v.outstanding, { needsHuman: [], pendingReview: [], blocked: [] });
});

test('plannedTaskIds scopes completeness — an out-of-scope needs-human does not mark incomplete', () => {
  const v = computeReleaseVerdict(
    checklist,
    statusOf({ 'svc.smoke.001': 'passed', 'svc.extra.001': 'skipped-needs-human' }),
    { plannedTaskIds: ['svc.smoke.001'] },
  );
  assert.equal(v.release, 'pass');
  assert.deepEqual(v.outstanding.needsHuman, []);
});
