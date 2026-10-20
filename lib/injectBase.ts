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

  // Two mechanisms on purpose, because target="_blank" alone is not reliable
  // where TC actually runs.
  //
  // Justin: "from here if I click any of these URL's in the pop up window, I
  // get an error. Can you make the first click off the timeline or dataribbon
  // on SEC filings to open up in a popup and from the popup, any other URL's
  // open in a new browser window?"
  //
  // <base target="_blank"> is the declarative half and is enough in a plain
  // browser. But TC also runs under Electron, where a _blank from inside a
  // frame goes to setWindowOpenHandler and is denied by default — the click
  // would silently do nothing. So the script below intercepts the click and
  // hands the URL to TC, which opens it with its own window.open. That path is
  // known to work in his build: it is what the pop-out buttons already use.
  //
  // Inline and tiny so it cannot fail to load, and it only ever sends an
  // absolute http(s) URL; the parent validates before acting on it.
  const tag =
    `<base href="${escaped}" target="_blank">` +
    `<script>(function(){document.addEventListener('click',function(e){` +
    `var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;` +
    `var u=a.href;if(!/^https?:/i.test(u))return;` +
    `e.preventDefault();e.stopPropagation();` +
    `try{parent.postMessage({type:'tc-open-url',url:u},'*')}catch(_){}` +
    `},true)})()</script>`

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
