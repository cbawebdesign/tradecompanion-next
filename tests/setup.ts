// The store uses zustand's persist middleware, which writes to localStorage on
// every set(). Node has no localStorage, so provide a minimal in-memory stand-in
// rather than pulling in jsdom for what is otherwise a pure-logic test suite.
const mem = new Map<string, string>()

const shim: Storage = {
  get length() { return mem.size },
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => { mem.clear() },
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: shim, writable: true })
}
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', { value: shim, writable: true })
}
