// Safe clipboard wrapper.
//
// `navigator.clipboard.writeText` rejects with "Document is not focused"
// when the page lost focus (devtools, popup, alt-tab). The error was being
// reported by the global error boundary even though it's harmless. This
// wrapper swallows the rejection and falls back to a hidden textarea +
// document.execCommand('copy') when modern API is unavailable or denied.

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // Modern API — works when the document is focused and has clipboard-write permission.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy path
    }
  }

  // Legacy fallback — hidden textarea + execCommand.
  if (typeof document === 'undefined') return false
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
