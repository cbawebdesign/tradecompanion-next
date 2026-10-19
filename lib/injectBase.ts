/**
 * Rewrites a fetched document so links inside it open in a new browser window.
 *
 * Used by /api/embed — see that route for why this exists at all.
 */

/**
 * Drops any <base> the document already carries and installs ours.
 *
 * Lives here rather than in the route because a Next.js route module may only
 * export request handlers — exporting a helper from it fails the build.
 *
 * Placement matters more than it looks: the tag has to land before the first
 * link or relative asset in the document, which in practice means immediately
 * after <head>.
 */
export function injectBase(html: string, href: string): string {
  const escaped = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const tag = `<base href="${escaped}" target="_blank">`

  // A second <base> is ignored by the parser, so an existing one would win.
  const cleaned = html.replace(/<base\b[^>]*>/gi, '')

  const head = cleaned.match(/<head\b[^>]*>/i)
  if (head) {
    const at = head.index! + head[0].length
    return cleaned.slice(0, at) + tag + cleaned.slice(at)
  }

  const htmlTag = cleaned.match(/<html\b[^>]*>/i)
  if (htmlTag) {
    const at = htmlTag.index! + htmlTag[0].length
    return cleaned.slice(0, at) + '<head>' + tag + '</head>' + cleaned.slice(at)
  }

  return tag + cleaned
}
