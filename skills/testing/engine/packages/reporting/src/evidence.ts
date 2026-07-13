import fs from 'node:fs';
import path from 'node:path';

/**
 * Organize a run's raw artifacts into a clean, browsable `evidence/` tree so a manager can find the
 * PROOF quickly, with **video and documents kept separate**:
 *
 *   results/<runId>/evidence/
 *     videos/         <taskId>.webm            ← the recordings (proof the flow was tested)
 *     documents/<taskId>/ …                    ← screenshots, snapshots, console logs, result files
 *     README.md                                ← what's here
 *
 * Non-destructive: the raw `agent/<taskId>/` and `human/<taskId>/` dirs stay the source of truth
 * (re-runs / resume rely on them). We HARD-LINK files into evidence/ (same bytes, no duplication —
 * important for large webm), falling back to a copy when a hard link isn't possible (cross-volume).
 * Sensitive class-c videos are disk-only anyway; they still land here (on the owner's own disk) but
 * are never zipped/shipped by the report — that boundary is unchanged.
 */

/** Files we never surface as "documents" — internal harness config / noise. */
const DOC_DENY = new Set([
  'mcp.json',
  'mcp-pw-config.json',
  'agent-settings.json',
  'guard-config.json',
  'guard-log.ndjson',
]);

function linkOrCopy(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    if (fs.existsSync(dest)) fs.rmSync(dest);
    fs.linkSync(src, dest); // hard link — no byte duplication
  } catch {
    try {
      fs.copyFileSync(src, dest);
    } catch {
      /* best effort — a locked/transient file must not abort the whole organize step */
    }
  }
}

/** Recursively walk a task dir, hard-linking videos into videosDir and everything else (minus the
 * deny-list) into documents/<taskId>/, preserving relative sub-paths (e.g. session-1/session.md). */
function collectTask(taskDir: string, taskId: string, videosDir: string, docsRoot: string): number {
  const webms: Array<{ abs: string; name: string; size: number }> = [];
  const walk = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(abs, relPath);
        continue;
      }
      if (e.name.toLowerCase().endsWith('.webm')) {
        let size = 0;
        try { size = fs.statSync(abs).size; } catch { /* ignore */ }
        webms.push({ abs, name: e.name, size });
        continue;
      }
      if (DOC_DENY.has(e.name)) continue;
      linkOrCopy(abs, path.join(docsRoot, taskId, relPath));
    }
  };
  walk(taskDir, '');
  // The PRIMARY video (linked as evidence/videos/<taskId>.webm — what the report cites) must be the
  // agent's own recording, which it names `<taskId>.webm`; extra keeper-tab clips are auto-named.
  // Prefer an exact `<taskId>.webm`, then the largest file (the driven page), so a blank background
  // tab never becomes the headline proof. Extras get a numeric suffix.
  webms.sort((a, b) => {
    const ax = a.name === `${taskId}.webm` ? 1 : 0;
    const bx = b.name === `${taskId}.webm` ? 1 : 0;
    return bx - ax || b.size - a.size;
  });
  webms.forEach((v, i) => {
    const dest = i === 0 ? path.join(videosDir, `${taskId}.webm`) : path.join(videosDir, `${taskId}-${i + 1}.webm`);
    linkOrCopy(v.abs, dest);
  });
  return webms.length;
}

export interface EvidenceSummary {
  videos: number;
  tasks: number;
  videosDir: string;
  documentsDir: string;
}

/** Build (or refresh) results/<runId>/evidence/. Safe to call repeatedly. */
export function organizeEvidence(runDir: string): EvidenceSummary {
  const evidenceDir = path.join(runDir, 'evidence');
  const videosDir = path.join(evidenceDir, 'videos');
  const documentsDir = path.join(evidenceDir, 'documents');
  fs.mkdirSync(videosDir, { recursive: true });
  fs.mkdirSync(documentsDir, { recursive: true });

  let videos = 0;
  let tasks = 0;
  for (const lane of ['agent', 'human'] as const) {
    const laneDir = path.join(runDir, lane);
    if (!fs.existsSync(laneDir)) continue;
    for (const taskId of fs.readdirSync(laneDir)) {
      const taskDir = path.join(laneDir, taskId);
      try {
        if (!fs.statSync(taskDir).isDirectory()) continue;
      } catch {
        continue;
      }
      tasks++;
      videos += collectTask(taskDir, taskId, videosDir, documentsDir);
    }
  }

  const readme =
    '# Evidence\n\n' +
    'A clean, separated view of this run\'s results (videos and documents kept apart):\n\n' +
    '- `videos/<taskId>.webm` — full recording of each test, the proof the flow was actually exercised.\n' +
    '- `documents/<taskId>/` — screenshots, snapshots, console logs and result files.\n\n' +
    '_Built from `agent/` and `human/` via hard-link (no size doubling); the raw copy stays untouched._\n';
  try {
    fs.writeFileSync(path.join(evidenceDir, 'README.md'), readme);
  } catch {
    /* best effort */
  }

  return { videos, tasks, videosDir, documentsDir };
}
