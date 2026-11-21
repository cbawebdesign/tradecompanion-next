/**
 * A tweet older than the previous market close is never "new".
 *
 * Justin (11/14): flagged AMD and a tweet from May 6 appeared on the timeline.
 * The feed only asks for tweets newer than the newest ID it has seen, and
 * never checks their age. The first fetch after a reload marks everything as
 * seen and remembers the newest ID, which with the X feed stopped since May
 * is months old. Flagging a symbol widens the server's subscription filter,
 * and any of that symbol's old tweets with a higher ID than the remembered
 * one then arrive as new.
 *
 * Same cutoff as the YouTube / Substack feed (prevMarketCloseISO): the whole
 * current session is kept, whenever TC is opened. A timestamp that doesn't
 * parse is kept, since the goal is never to lose a live tweet.
 */
export function isStaleTweet(createdAt: string | null | undefined, cutoffISO: string): boolean {
  const t = Date.parse(createdAt ?? '')
  const cutoff = Date.parse(cutoffISO)
  if (isNaN(t) || isNaN(cutoff)) return false
  return t < cutoff
}
