/** Run ids are filesystem-safe on Windows (no colons) and sort chronologically. */
export function makeRunId(service: string, envProfile: string, label?: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const parts = [stamp, service, envProfile];
  if (label) parts.push(label.replace(/[^a-z0-9-]/gi, '-'));
  return parts.join('_');
}
