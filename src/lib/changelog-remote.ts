import { semverCompare } from "@/lib/semver-compare";

/** GitHub の blob URL を raw.githubusercontent.com の URL に変換する。 */
export function githubBlobUrlToRawUrl(blobUrl: string): string | null {
  try {
    const u = new URL(blobUrl);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const blobIdx = parts.indexOf("blob");
    if (blobIdx < 2 || blobIdx + 2 >= parts.length) return null;
    const owner = parts[0];
    const repo = parts[1];
    const ref = parts[blobIdx + 1];
    const filePath = parts.slice(blobIdx + 2).join("/");
    if (!owner || !repo || !ref || !filePath) return null;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  } catch {
    return null;
  }
}

/**
 * クライアントでフェッチする CHANGELOG の raw URL。
 * `NEXT_PUBLIC_CHANGELOG_RAW_URL` があれば優先。なければ `NEXT_PUBLIC_CHANGELOG_URL` から導出。
 */
export function getChangelogRawUrlForClient(): string | null {
  if (typeof process.env.NEXT_PUBLIC_CHANGELOG_RAW_URL === "string" && process.env.NEXT_PUBLIC_CHANGELOG_RAW_URL.length > 0) {
    return process.env.NEXT_PUBLIC_CHANGELOG_RAW_URL;
  }
  const blob = process.env.NEXT_PUBLIC_CHANGELOG_URL;
  if (typeof blob === "string" && blob.length > 0) {
    return githubBlobUrlToRawUrl(blob);
  }
  return null;
}

function stripSimpleMarkdown(line: string): string {
  let s = line.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return s.trim();
}

/** リリース節の本文から最初の箇条書き 1 行を要約として取り出す。 */
function firstBulletSummary(sectionBody: string, maxLen: number): string {
  const lines = sectionBody.split("\n");
  for (const line of lines) {
    const m = /^\s*-\s*(.+)$/.exec(line);
    if (m?.[1]) {
      const t = stripSimpleMarkdown(m[1]);
      if (t.length > maxLen) return `${t.slice(0, maxLen)}…`;
      return t;
    }
  }
  return "";
}

export type ParsedLatestRelease = {
  version: string;
  summary: string;
};

/**
 * Keep a Changelog 形式の Markdown から、日付付きの最新リリース版とその先頭箇条書きを返す。
 * `## [Unreleased]` は対象外（セマバ付き `## [x.y.z] - date` のみ）。
 */
export function parseLatestDatedReleaseFromChangelog(markdown: string): ParsedLatestRelease | null {
  const headers: { version: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  const re = /^## \[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm;
  while ((m = re.exec(markdown)) !== null) {
    headers.push({ version: m[1]!, index: m.index });
  }
  if (headers.length === 0) return null;

  let best = headers[0]!;
  for (const h of headers) {
    if (semverCompare(h.version, best.version) > 0) best = h;
  }

  const fromHeader = markdown.slice(best.index);
  const nextNl = fromHeader.search(/\n## \[/);
  const sectionBody = nextNl === -1 ? fromHeader : fromHeader.slice(0, nextNl);
  const summary = firstBulletSummary(sectionBody, 140);

  return { version: best.version, summary };
}
