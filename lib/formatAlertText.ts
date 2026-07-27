// Display-only formatting for alert message text. Kept SEPARATE from
// lib/alertDedup.ts `normalizeAlertMessage` on purpose: that one is
// load-bearing for de-duplication and must not change. This one only cleans
// text for rendering in the timeline + data ribbon.
//
// Fixes (Justin, 7/22):
//   - HTML entities showing raw in PRs/catalysts: `&amp;` `&#39;` `&quot;` etc.
//   - Source prefixes like `[TX-News1]` / `[Benzinga]` / `[+]` cluttering the
//     visible message.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…',
}

/** Decode the HTML entities that show up in PR/headline text. */
export function decodeEntities(input: string): string {
  if (!input || input.indexOf('&') === -1) return input
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => {
      const key = name.toLowerCase()
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m
    })
}

function safeFromCodePoint(cp: number): string {
  try { return Number.isFinite(cp) ? String.fromCodePoint(cp) : '' } catch { return '' }
}

/** Strip a single leading `[Source]` / `[+]` / `[-]` prefix (display only). */
export function stripSourcePrefix(input: string): string {
  return input.replace(/^\s*\[[A-Za-z0-9_.+-]+\]\s*/, '')
}

/** The one the components call: decode entities + strip the source prefix. */
export function formatAlertText(input: string | undefined | null): string {
  if (!input) return ''
  return decodeEntities(stripSourcePrefix(input)).trim()
}
