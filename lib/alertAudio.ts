// Centralized alert audio system — per-type sounds + TTS
// Replaces the scattered playAlertSound() calls with a single entry point

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Play a tone with configurable frequency and duration
export function playTone(frequency: number = 800, durationMs: number = 150, volume: number = 0.3) {
  try {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch (e) {
    // Audio context may not be available (e.g., no user gesture yet)
  }
}

// Play per-type alert sound using config
export function playAlertSoundForType(
  alertType: string,
  alertSounds: Record<string, { enabled: boolean; frequency: number; duration: number }>
) {
  const sound = alertSounds[alertType]
  if (sound && sound.enabled) {
    playTone(sound.frequency, sound.duration)
  } else {
    // Fallback to default beep
    playTone(800, 150)
  }
}

// Text-to-speech with 30-second dedup (same as legacy SpeechService.cs)
const recentSpeech = new Map<string, number>()
const SPEECH_DEDUP_MS = 30_000

export function speakAlert(text: string) {
  if (!('speechSynthesis' in window)) return

  const now = Date.now()
  const lastSpoken = recentSpeech.get(text)
  if (lastSpoken && now - lastSpoken < SPEECH_DEDUP_MS) return

  // Clean old entries
  Array.from(recentSpeech.entries()).forEach(([key, time]) => {
    if (now - time > SPEECH_DEDUP_MS) recentSpeech.delete(key)
  })

  recentSpeech.set(text, now)

  const utterance = new SpeechSynthesisUtterance(text)
  // Match legacy: female adult voice
  const voices = speechSynthesis.getVoices()
  const femaleVoice = voices.find(v =>
    v.name.toLowerCase().includes('female') ||
    v.name.toLowerCase().includes('samantha') ||
    v.name.toLowerCase().includes('victoria') ||
    v.name.toLowerCase().includes('karen')
  )
  if (femaleVoice) utterance.voice = femaleVoice
  utterance.rate = 1.0
  utterance.volume = 0.8

  speechSynthesis.speak(utterance)
}

// Combined alert sound handler — called from hooks when an alert fires
export function handleAlertAudio(
  alertType: string,
  message: string,
  config: {
    audioEnabled: boolean
    ttsEnabled: boolean
    alertSounds: Record<string, { enabled: boolean; frequency: number; duration: number }>
  }
) {
  if (!config.audioEnabled) return

  // Play per-type tone
  playAlertSoundForType(alertType, config.alertSounds)

  // TTS if enabled
  if (config.ttsEnabled) {
    speakAlert(message)
  }
}
