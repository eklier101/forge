/** Semver helpers + changelog fetch for What's New / history. */

/** Plain string (legacy) or title + readable body for tap-to-expand. */
export type ChangelogNote =
  | string
  | {
      title: string;
      body: string;
    };

export type ChangelogEntry = {
  version: string;
  date?: string;
  /** One friendly line for the version as a whole */
  summary?: string;
  notes: ChangelogNote[];
};

export function noteTitle(n: ChangelogNote): string {
  if (typeof n === "string") return n.trim();
  return String(n.title ?? "").trim();
}

export function noteBody(n: ChangelogNote): string {
  if (typeof n === "string") return n.trim();
  const body = String(n.body ?? "").trim();
  return body || noteTitle(n);
}

/** Flat titles for banners / /version API consumers. */
export function noteTitles(notes: ChangelogNote[] | undefined): string[] {
  return (notes ?? []).map(noteTitle).filter(Boolean);
}

export function cmpSemver(a: string, b: string): number {
  const pa = String(a).split(".").map((x) => Number(x) || 0);
  const pb = String(b).split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Entries with seen < version <= current, oldest first.
 *  First launch (no seen): only the current app version.
 */
export function entriesSince(
  versions: ChangelogEntry[],
  seenVersion: string | null,
  currentVersion: string,
): ChangelogEntry[] {
  return versions
    .filter((e) => {
      if (!e.notes?.length) return false;
      if (cmpSemver(e.version, currentVersion) > 0) return false;
      if (!seenVersion) return e.version === currentVersion;
      if (cmpSemver(e.version, seenVersion) <= 0) return false;
      return true;
    })
    .sort((a, b) => cmpSemver(a.version, b.version));
}

export function flattenNotes(entries: ChangelogEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    for (const n of e.notes ?? []) {
      const t = noteTitle(n);
      if (t) out.push(t);
    }
  }
  return out;
}

export async function fetchChangelog(apiBase: string): Promise<ChangelogEntry[]> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/changelog`);
  if (!res.ok) throw new Error(`changelog ${res.status}`);
  const data = (await res.json()) as { versions?: ChangelogEntry[] };
  return Array.isArray(data.versions) ? data.versions : [];
}
