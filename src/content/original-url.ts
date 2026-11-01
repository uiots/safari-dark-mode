// Pure URL upgrades for the hover preview. Rules turn a thumbnail URL into
// higher-resolution candidates; the preview still falls back to the DOM URL
// when a rewrite 404s. No network. To add a rule, append to ORIGINAL_URL_RULES
// in original-url-rules.ts. Host-scoped rules run only when the image host
// equals the suffix or is a subdomain of it. context.pageHost is the page
// hostname for a future rule that needs it; shipped rules are URL-only.

import {ORIGINAL_URL_RULES} from './original-url-rules';

export interface OriginalUrlContext {
  readonly pageHost?: string;
}

export interface OriginalUrlRule {
  readonly id: string;
  /** Exact host or registrable suffix. Omit to run against every http(s) URL. */
  readonly hosts?: readonly string[];
  /** Return absolute http(s) candidates, best first. Do not mutate `url`. */
  readonly rewrite: (url: URL, context: OriginalUrlContext) => readonly string[];
}

const MAX_REWRITE_DEPTH = 3;
const MAX_REWRITE_CANDIDATES = 8;

interface RankedUrl {
  readonly href: string;
  readonly depth: number;
  readonly order: number;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, suffixes: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  for (const suffix of suffixes) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return true;
    }
  }
  return false;
}

function rankCandidates(items: readonly RankedUrl[]): readonly string[] {
  return [...items]
    .sort((left, right) => right.depth - left.depth || left.order - right.order)
    .map((item) => item.href);
}

// Deeper rewrites sort first so stacked markers (a size suffix plus a process
// query, a WordPress dimension plus `_thumb`) collapse to one original before
// the partial upgrades are tried.
export function expandOriginalUrls(
  rawUrl: string,
  context: OriginalUrlContext = {},
  rules: readonly OriginalUrlRule[] = ORIGINAL_URL_RULES,
): readonly string[] {
  const start = parseHttpUrl(rawUrl);
  if (start === null) {
    return [];
  }
  const ranked: RankedUrl[] = [];
  const seen = new Set<string>([start.href]);
  const queue: {href: string; depth: number}[] = [{href: start.href, depth: 0}];
  let order = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined || current.depth >= MAX_REWRITE_DEPTH) {
      continue;
    }
    const parsed = current.depth === 0 ? start : parseHttpUrl(current.href);
    if (parsed === null) {
      continue;
    }
    for (const rule of rules) {
      if (rule.hosts !== undefined && !hostMatches(parsed.hostname, rule.hosts)) {
        continue;
      }
      let rewritten: readonly string[] = [];
      try {
        rewritten = rule.rewrite(new URL(parsed.href), context);
      } catch {
        continue;
      }
      for (const candidate of rewritten) {
        const normalized = parseHttpUrl(candidate);
        if (normalized === null || seen.has(normalized.href)) {
          continue;
        }
        seen.add(normalized.href);
        ranked.push({href: normalized.href, depth: current.depth + 1, order});
        order += 1;
        if (ranked.length >= MAX_REWRITE_CANDIDATES) {
          return rankCandidates(ranked);
        }
        queue.push({href: normalized.href, depth: current.depth + 1});
      }
    }
  }
  return rankCandidates(ranked);
}
