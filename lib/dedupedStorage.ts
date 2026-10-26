import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage, minus the writes that change nothing.
 *
 * zustand's persist middleware calls setItem on EVERY set(), whether or not
 * the persisted slice changed. Quotes arrive every 250ms in the main window
 * and are relayed to every pop-out, so each window was rewriting the whole
 * persisted store about four times a second — including its own copy of the
 * watchlists, however stale.
 *
 * That is a lost-update race. Justin (Price Alerts Bug): a triggered alert
 * "will just stay flashing for an indefinite period of time". The main window
 * auto-cleared the box after 5 seconds and wrote that, then a pop-out that had
 * not yet seen the clear wrote its old watchlists on its next quote tick, and
 * useCrossWindowSync dutifully pulled 150.20 back into the main window.
 *
 * Skipping a write whose payload is identical to the last one this window read
 * or wrote means a window only writes when IT changed something, so an
 * unchanged stale copy can no longer overwrite a newer one.
 */
export function createDedupedStorage(getBacking: () => StateStorage): StateStorage {
  const last = new Map<string, string | null>()
  return {
    getItem: (name) => {
      const value = getBacking().getItem(name)
      // Hydration reads synchronously from localStorage, so this is a string.
      if (typeof value === 'string' || value === null) last.set(name, value)
      return value
    },
    setItem: (name, value) => {
      if (last.get(name) === value) return
      last.set(name, value)
      return getBacking().setItem(name, value)
    },
    removeItem: (name) => {
      last.delete(name)
      return getBacking().removeItem(name)
    },
  }
}
