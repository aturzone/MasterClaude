#!/usr/bin/env node
// ui-intel — MASTER CLAUDE's design-intelligence query engine.
// Dep-free Node. Reads ./data/*.json and answers design questions with concrete picks.
//
//   node uikit.mjs --design-system "<query>" [--stack next] [--persist --out <root>] [--page <name>]
//   node uikit.mjs --domain <products|palettes|styles|fonts|ux-rules> "<query>" [--top 5]
//   node uikit.mjs --list <domain>
//   node uikit.mjs --check            # verify data integrity + real WCAG contrast ratios
//
// Every palette ships contrast-verified: `--check` computes WCAG 2.2 ratios rather than
// trusting an author's note, and CI fails on a violation. See SKILL.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, "data");
const DOMAINS = ["products", "palettes", "styles", "fonts", "ux-rules"];

// ---------------------------------------------------------------- data loading

const cache = new Map();
function load(domain) {
  if (cache.has(domain)) return cache.get(domain);
  const file = path.join(DATA, `${domain}.json`);
  if (!fs.existsSync(file)) die(`no data for domain "${domain}" (expected ${file})`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    die(`${domain}.json is not valid JSON — ${e.message}`);
  }
  const items = parsed.items || [];
  cache.set(domain, items);
  return items;
}

const byId = (domain, id) => load(domain).find((x) => x.id === id);

// ---------------------------------------------------------------- scoring
// Weighted token overlap. Predictable and explainable — a design pick should be
// traceable to the words the user actually said, not to an opaque relevance score.

const STOP = new Set(["a", "an", "the", "for", "of", "and", "or", "to", "with", "my", "our", "app", "site", "website", "build", "make", "want", "need", "page"]);
const tokenize = (s) =>
  String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

function scoreItem(item, qTokens) {
  const fields = [
    [item.keywords || [], 4],
    [[item.name, item.id], 3],
    [[item.mood, item.vibe, item.colorMood, item.typeMood, item.pattern], 1],
    [item.fits || item.bestFor || [], 2],
  ];
  let score = 0;
  const hits = new Set();
  for (const [vals, weight] of fields) {
    const hay = tokenize([].concat(vals).join(" "));
    for (const q of qTokens) {
      for (const h of hay) {
        if (h === q) { score += weight; hits.add(q); }
        else if (h.length > 3 && q.length > 3 && (h.startsWith(q) || q.startsWith(h))) { score += weight * 0.5; hits.add(q); }
      }
    }
  }
  return { score, coverage: hits.size / Math.max(1, qTokens.length) };
}

function search(domain, query, top = 5) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return load(domain).slice(0, top).map((item) => ({ item, score: 0 }));
  return load(domain)
    .map((item) => ({ item, ...scoreItem(item, qTokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
    .slice(0, top);
}

// ---------------------------------------------------------------- WCAG contrast

const hexToRgb = (hex) => {
  const h = String(hex).trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
};

const toLinear = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// What each pair is actually used for decides the threshold.
// 4.5 = AA body text · 3 = AA large text / UI component boundary · 1.5 = decorative separation.
const PAIRS = [
  ["foreground", "background", 4.5, "body text on the page"],
  ["cardForeground", "card", 4.5, "text on a card"],
  ["mutedForeground", "muted", 4.5, "secondary text on a muted surface"],
  ["primaryForeground", "primary", 4.5, "label on a primary button"],
  ["accentForeground", "accent", 4.5, "label on an accent/CTA button"],
  ["destructiveForeground", "destructive", 4.5, "label on a destructive button"],
  ["primary", "background", 3, "primary as a UI boundary/link on the page"],
  ["ring", "background", 3, "focus ring visibility"],
  ["border", "background", 1.5, "border separation"],
];

function checkPalette(p) {
  const problems = [];
  for (const mode of ["light", "dark"]) {
    const tokens = p[mode];
    if (!tokens) { problems.push(`${p.id}: missing "${mode}" mode`); continue; }
    for (const [fg, bg, min, use] of PAIRS) {
      if (!(fg in tokens) || !(bg in tokens)) { problems.push(`${p.id}/${mode}: missing token ${fg in tokens ? bg : fg}`); continue; }
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio === null) { problems.push(`${p.id}/${mode}: bad hex in ${fg}/${bg}`); continue; }
      if (ratio < min) problems.push(`${p.id}/${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1 — ${use}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- checks

// `only` scopes the check to one domain, so a domain can be validated on its own
// while the rest of the knowledge base is still being written.
function runCheck(only) {
  const scope = only ? [only] : DOMAINS;
  if (only && !DOMAINS.includes(only)) die(`unknown domain "${only}". Known: ${DOMAINS.join(", ")}`);
  const problems = [];
  const seen = new Set();

  for (const d of scope) {
    const items = load(d);
    if (!items.length) problems.push(`${d}: no items`);
    for (const it of items) {
      if (!it.id) { problems.push(`${d}: an item has no id`); continue; }
      const key = `${d}/${it.id}`;
      if (seen.has(key)) problems.push(`${d}: duplicate id "${it.id}"`);
      seen.add(key);
      if (!it.name) problems.push(`${key}: missing name`);
      if (!(it.keywords || []).length) problems.push(`${key}: no keywords — it can never be found by search`);
    }
  }

  // Cross-references must resolve, or --design-system silently recommends nothing.
  if (scope.includes("products")) {
    for (const p of load("products")) {
      if (p.palette && !byId("palettes", p.palette)) problems.push(`products/${p.id}: palette "${p.palette}" does not exist`);
      if (p.fonts && !byId("fonts", p.fonts)) problems.push(`products/${p.id}: fonts "${p.fonts}" does not exist`);
      for (const s of p.style || []) if (!byId("styles", s)) problems.push(`products/${p.id}: style "${s}" does not exist`);
    }
  }

  let pairs = 0;
  if (scope.includes("palettes")) {
    const palettes = load("palettes");
    for (const p of palettes) problems.push(...checkPalette(p));
    pairs = palettes.length * 2 * PAIRS.length;
  }

  const counts = scope.map((d) => `${load(d).length} ${d}`).join(" · ");
  if (problems.length) {
    console.error(`ui-intel check FAILED — ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`\n(${counts})`);
    process.exit(1);
  }
  console.log(`ui-intel check OK — ${counts}`);
  if (pairs) console.log(`WCAG: ${pairs} contrast pairs verified (light + dark) — computed, not asserted.`);
}

// ---------------------------------------------------------------- design system

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

// Take the worst offenders from EVERY band, not the global top-N. Sorting the whole set by
// priority and slicing means band 1 (accessibility) fills the list on its own and the checklist
// silently loses touch targets, LCP and layout — a checklist that only covers its first band is
// worse than none, because it reads as complete.
function checklist(all) {
  const bands = new Map();
  for (const r of all) {
    const b = r.priority || 99;
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(r);
  }
  const out = [];
  for (const b of [...bands.keys()].sort((x, y) => x - y)) {
    const ranked = bands.get(b).sort((x, y) => (SEV_RANK[x.severity] ?? 9) - (SEV_RANK[y.severity] ?? 9));
    out.push(...ranked.slice(0, b <= 3 ? 2 : 1)); // the critical bands get two; everything else one
  }
  return out;
}

function designSystem(query, stack) {
  const product = search("products", query, 1)[0]?.item;
  if (!product) {
    return { unmatched: true, query, suggestions: load("products").slice(0, 8).map((p) => p.name) };
  }
  const styles = (product.style || []).map((s) => byId("styles", s)).filter(Boolean);
  const palette = byId("palettes", product.palette);
  const fonts = byId("fonts", product.fonts);
  return { product, styles, palette, fonts, rules: checklist(load("ux-rules")), stack };
}

function renderDesignSystem(ds, projectName) {
  if (ds.unmatched) {
    return [
      `# No product match for "${ds.query}"`,
      ``,
      `Nothing in the knowledge base scored above zero. Either rephrase with the product type`,
      `(e.g. "b2b saas dashboard", "beauty spa booking"), or pick the closest of:`,
      ``,
      ...ds.suggestions.map((s) => `- ${s}`),
    ].join("\n");
  }
  const { product, styles, palette, fonts, rules, stack } = ds;
  const L = [];
  L.push(`# Design system — ${projectName || product.name}`);
  L.push(``);
  L.push(`> Generated by MASTER CLAUDE \`ui-intel\`. This is the **source of truth** for this project's UI.`);
  L.push(`> Page-specific overrides live in \`pages/<page>.md\` and win over this file.`);
  L.push(``);
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| Product type | ${product.name} |`);
  if (stack) L.push(`| Stack | ${stack} |`);
  L.push(`| Layout pattern | ${product.pattern} |`);
  L.push(`| Color mood | ${product.colorMood || "—"} |`);
  L.push(`| Type mood | ${product.typeMood || "—"} |`);
  L.push(``);

  if (styles.length) {
    L.push(`## Style — ${styles.map((s) => s.name).join(" + ")}`);
    for (const s of styles) {
      L.push(``);
      L.push(`**${s.name}** — ${s.vibe}`);
      if (s.signature?.length) L.push(`- Signature moves: ${s.signature.join(" · ")}`);
      if (s.doNotUseFor?.length) L.push(`- Do **not** use for: ${s.doNotUseFor.join(" · ")}`);
    }
    L.push(``);
  }

  if (palette) {
    L.push(`## Palette — ${palette.name}`);
    L.push(`${palette.mood}`);
    L.push(``);
    L.push(`Drop straight into \`:root\` / \`[data-theme="dark"]\` (shadcn-shaped — every pair below is`);
    L.push(`WCAG-verified by \`uikit.mjs --check\`, not eyeballed):`);
    L.push(``);
    L.push("```css");
    L.push(`:root {`);
    for (const [k, v] of Object.entries(palette.light)) L.push(`  --${kebab(k)}: ${v};`);
    L.push(`}`);
    L.push(`[data-theme="dark"] {`);
    for (const [k, v] of Object.entries(palette.dark)) L.push(`  --${kebab(k)}: ${v};`);
    L.push(`}`);
    L.push("```");
    L.push(``);
    const r = contrast(palette.light.foreground, palette.light.background);
    L.push(`Body text contrast (light): **${r.toFixed(2)}:1** — AA requires 4.5:1.`);
    L.push(``);
  }

  if (fonts) {
    L.push(`## Typography — ${fonts.name}`);
    L.push(``);
    L.push(`| Role | Family |`);
    L.push(`|---|---|`);
    L.push(`| Display / headings | ${fonts.display} |`);
    L.push(`| Body | ${fonts.body} |`);
    if (fonts.mono) L.push(`| Mono | ${fonts.mono} |`);
    L.push(``);
    if (fonts.import) { L.push("```html"); L.push(fonts.import); L.push("```"); L.push(``); }
  }

  if (product.effects?.length) {
    L.push(`## Signature effects`);
    for (const e of product.effects) L.push(`- ${e}`);
    L.push(``);
  }

  if (product.decisionRules?.length) {
    L.push(`## Decision rules — apply the ones that match this project`);
    L.push(``);
    L.push(`| If | Then |`);
    L.push(`|---|---|`);
    for (const r of product.decisionRules) L.push(`| ${r.if} | ${r.then} |`);
    L.push(``);
  }

  if (product.antiPatterns?.length) {
    L.push(`## Anti-patterns — do not ship these`);
    for (const a of product.antiPatterns) L.push(`- ❌ ${a}`);
    L.push(``);
  }

  L.push(`## Pre-delivery checklist`);
  L.push(`Worked top-down: a band-1 miss is a blocker however good the page looks.`);
  L.push(``);
  let band = null;
  for (const r of rules) {
    if (r.priority !== band) { band = r.priority; L.push(`\n**${band}. ${r.category}**`); }
    L.push(`- [ ] **${r.name}** — ${r.check}`);
  }
  L.push(``);
  L.push(`---`);
  L.push(`*MASTER CLAUDE · ui-intel. Regenerate with \`--force\`; hand-edits are kept otherwise.*`);
  return L.join("\n");
}

const kebab = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

function persist(ds, { out, projectName, page, force }) {
  const root = path.resolve(out || process.cwd());
  const dir = path.join(root, ".mc", "design");
  const master = path.join(dir, "MASTER.md");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });

  if (fs.existsSync(master) && !force) {
    console.log(`kept  ${rel(root, master)} — already exists (pass --force to regenerate)`);
    console.log(`      Read it before building; it may hold decisions a human made.`);
  } else {
    fs.writeFileSync(master, renderDesignSystem(ds, projectName) + "\n", "utf8");
    console.log(`wrote ${rel(root, master)}`);
  }

  if (page) {
    const pf = path.join(dir, "pages", `${slug(page)}.md`);
    if (fs.existsSync(pf) && !force) {
      console.log(`kept  ${rel(root, pf)} — already exists (pass --force to regenerate)`);
    } else {
      const pattern = ds.unmatched ? null : byId("products", ds.product.id)?.pages?.[slug(page)];
      fs.writeFileSync(pf, renderPageOverride(page, pattern) + "\n", "utf8");
      console.log(`wrote ${rel(root, pf)}`);
    }
  }
}

function renderPageOverride(page, pattern) {
  return [
    `# Page override — ${page}`,
    ``,
    `> Overrides \`../MASTER.md\` for this page only. Anything not stated here inherits from MASTER.`,
    ``,
    `## Layout`,
    pattern ? pattern : `_Fill in from \`fe-page-patterns\` for a "${page}" page._`,
    ``,
    `## Deviations from MASTER`,
    `| Token / rule | MASTER says | This page uses | Why |`,
    `|---|---|---|---|`,
    `| | | | |`,
    ``,
    `*Keep this table short. A long list of deviations means MASTER is wrong — fix MASTER instead.*`,
  ].join("\n");
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rel = (root, p) => path.relative(root, p).split(path.sep).join("/");

// ---------------------------------------------------------------- output

function renderHit({ item, score }, domain) {
  const head = `${item.name}${score ? `  (score ${score.toFixed(1)})` : ""}`;
  const L = [`## ${head}`];
  if (domain === "palettes") {
    L.push(`${item.mood}`);
    L.push(`light: bg ${item.light.background} · fg ${item.light.foreground} · primary ${item.light.primary} · accent ${item.light.accent}`);
    L.push(`dark:  bg ${item.dark.background} · fg ${item.dark.foreground} · primary ${item.dark.primary} · accent ${item.dark.accent}`);
  } else if (domain === "fonts") {
    L.push(`${item.vibe}`);
    L.push(`display ${item.display} · body ${item.body}${item.mono ? ` · mono ${item.mono}` : ""}`);
  } else if (domain === "styles") {
    L.push(`${item.vibe}`);
    if (item.bestFor?.length) L.push(`best for: ${item.bestFor.join(", ")}`);
    if (item.doNotUseFor?.length) L.push(`avoid for: ${item.doNotUseFor.join(", ")}`);
  } else if (domain === "ux-rules") {
    L.push(`[p${item.priority} ${item.severity}] ${item.check}`);
    if (item.antiPattern) L.push(`anti-pattern: ${item.antiPattern}`);
  } else {
    L.push(`pattern: ${item.pattern}`);
    L.push(`style: ${(item.style || []).join(" + ")} · palette: ${item.palette} · fonts: ${item.fonts}`);
    if (item.antiPatterns?.length) L.push(`avoid: ${item.antiPatterns.join(", ")}`);
  }
  return L.join("\n");
}

function die(msg) {
  console.error(`ui-intel: ${msg}`);
  process.exit(1);
}

const USAGE = `ui-intel — MASTER CLAUDE design intelligence

  node uikit.mjs --design-system "<query>" [--stack <s>] [-p "<name>"] [--persist --out <root>] [--page <p>] [--force]
  node uikit.mjs --domain <${DOMAINS.join("|")}> "<query>" [--top 5]
  node uikit.mjs --list <domain>
  node uikit.mjs --check [<domain>]              # data integrity + real WCAG contrast
  node uikit.mjs --contrast "#1E293B" "#F8FAFC"  # ratio + AA/AAA verdict for any pair`;

// ---------------------------------------------------------------- cli

// Flags that always consume the next argument as their value.
const VALUE_FLAGS = new Set(["--domain", "--list", "--stack", "--top", "--out", "--page", "-p", "--project"]);
// Flags whose value is optional — consume the next argument only if it isn't itself a flag.
const OPTIONAL_VALUE_FLAGS = new Set(["--check", "--design-system"]);

function parseArgs(args) {
  const flags = Object.create(null);
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("-")) { positional.push(a); continue; }
    const next = args[i + 1];
    if (VALUE_FLAGS.has(a)) { flags[a] = next ?? null; i++; }
    else if (OPTIONAL_VALUE_FLAGS.has(a) && next && !next.startsWith("-") && (a !== "--check" || DOMAINS.includes(next))) {
      flags[a] = next; i++;
    } else flags[a] = true;
  }
  return { flags, positional };
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(USAGE); return; }

  const { flags, positional } = parseArgs(args);
  const flag = (name, def = null) => (flags[name] === undefined || flags[name] === true ? def : flags[name]);
  const has = (name) => flags[name] !== undefined;

  if (has("--check")) return runCheck(flag("--check"));

  if (has("--contrast")) {
    const [fg, bg] = positional;
    if (!fg || !bg) die(`--contrast needs two colors, e.g. --contrast "#1E293B" "#F8FAFC"`);
    const r = contrast(fg, bg);
    if (r === null) die(`not a hex color: ${hexToRgb(fg) ? bg : fg}`);
    const verdict = (min, label) => `${r >= min ? "PASS" : "FAIL"} ${label} (needs ${min}:1)`;
    console.log(`${fg} on ${bg} → ${r.toFixed(2)}:1`);
    console.log(`  ${verdict(4.5, "AA body text")}`);
    console.log(`  ${verdict(3, "AA large text / UI component")}`);
    console.log(`  ${verdict(7, "AAA body text")}`);
    return;
  }

  if (has("--list")) {
    const d = flag("--list");
    if (!DOMAINS.includes(d)) die(`unknown domain "${d}". Known: ${DOMAINS.join(", ")}`);
    for (const it of load(d)) console.log(`${it.id.padEnd(24)} ${it.name}`);
    return;
  }

  if (has("--domain")) {
    const d = flag("--domain");
    if (!DOMAINS.includes(d)) die(`unknown domain "${d}". Known: ${DOMAINS.join(", ")}`);
    const q = positional.join(" ");
    const hits = search(d, q, Number(flag("--top", 5)));
    if (!hits.length) { console.log(`No ${d} matched "${q}". Try --list ${d}.`); return; }
    console.log(hits.map((h) => renderHit(h, d)).join("\n\n"));
    return;
  }

  if (has("--design-system")) {
    const q = positional.join(" ") || flag("--design-system");
    if (!q) die(`--design-system needs a query, e.g. --design-system "b2b saas dashboard"`);
    const ds = designSystem(q, flag("--stack"));
    if (has("--persist")) {
      persist(ds, { out: flag("--out"), projectName: flag("-p") || flag("--project"), page: flag("--page"), force: has("--force") });
      return;
    }
    console.log(renderDesignSystem(ds, flag("-p") || flag("--project")));
    return;
  }

  console.log(USAGE);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv);
