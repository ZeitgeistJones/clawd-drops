export type BeatAnalysisResult = {
  bpm: number
  dropSeconds: number
  peakSeconds: number
  drop: number
  peak: number
  energy: 'low' | 'medium' | 'high' | 'extreme'
  source: 'essentia.js' | 'rms' | 'fallback'
}

const TARGET_SAMPLE_RATE = 44100
const MAX_ANALYZE_SECONDS = 60
const WINDOW_SEC = 0.1
const BASELINE_SEC = 2

export function fallbackBeatAnalysis(duration = 8): BeatAnalysisResult {
  const dropSeconds = Math.round(duration * 0.55 * 10) / 10
  const peakSeconds = Math.round(duration * 0.7 * 10) / 10
  return {
    bpm: 128,
    dropSeconds,
    peakSeconds,
    drop: dropSeconds,
    peak: peakSeconds,
    energy: 'high',
    source: 'fallback',
  }
}

export function trimSignal(signal: Float32Array, sampleRate: number): Float32Array {
  const maxSamples = sampleRate * MAX_ANALYZE_SECONDS
  return signal.length > maxSamples ? signal.slice(0, maxSamples) : signal
}

export function resampleTo44100(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_SAMPLE_RATE) return input
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio
    const idx = Math.floor(srcIdx)
    const frac = srcIdx - idx
    const a = input[idx] ?? 0
    const b = input[idx + 1] ?? a
    output[i] = a * (1 - frac) + b * frac
  }
  return output
}

export function toMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]
  const len = channelData[0].length
  const mono = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    for (const ch of channelData) sum += ch[i] ?? 0
    mono[i] = sum / channelData.length
  }
  return mono
}

function rmsWindow(signal: Float32Array, startSample: number, windowSamples: number): number {
  let sum = 0
  const end = Math.min(startSample + windowSamples, signal.length)
  const count = Math.max(end - startSample, 1)
  for (let i = startSample; i < end; i++) sum += signal[i] * signal[i]
  return Math.sqrt(sum / count)
}

function computeRmsCurve(signal: Float32Array, sampleRate: number): { time: number; rms: number }[] {
  const windowSamples = Math.max(1, Math.floor(sampleRate * WINDOW_SEC))
  const points: { time: number; rms: number }[] = []
  for (let start = 0; start < signal.length; start += windowSamples) {
    points.push({
      time: start / sampleRate,
      rms: rmsWindow(signal, start, windowSamples),
    })
  }
  return points
}

function bpmFromTicks(ticks: number[]): number {
  if (ticks.length < 2) return 128
  const intervals: number[] = []
  for (let i = 1; i < ticks.length; i++) intervals.push(ticks[i] - ticks[i - 1])
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
  if (!avg || !Number.isFinite(avg)) return 128
  return Math.min(180, Math.max(60, Math.round(60 / avg)))
}

function snapToNearestBeat(time: number, ticks: number[]): number {
  if (!ticks.length) return time
  let best = ticks[0]
  let bestDist = Math.abs(time - best)
  for (const tick of ticks) {
    const dist = Math.abs(time - tick)
    if (dist < bestDist) {
      best = tick
      bestDist = dist
    }
  }
  return best
}

function energyFromRms(maxRms: number): BeatAnalysisResult['energy'] {
  if (maxRms < 0.05) return 'low'
  if (maxRms < 0.12) return 'medium'
  if (maxRms < 0.22) return 'high'
  return 'extreme'
}

export function deriveDropAndPeak(
  signal: Float32Array,
  sampleRate: number,
  beatTicks: number[] = []
): { dropSeconds: number; peakSeconds: number; bpm: number; energy: BeatAnalysisResult['energy'] } {
  const curve = computeRmsCurve(signal, sampleRate)
  const trackDuration = signal.length / sampleRate
  const introCutoff = trackDuration * 0.15
  const baselineWindows = Math.max(1, Math.ceil(BASELINE_SEC / WINDOW_SEC))

  let bestDropIdx = 0
  let bestDelta = -Infinity

  for (let i = baselineWindows; i < curve.length; i++) {
    if (curve[i].time < introCutoff) continue
    let baselineSum = 0
    for (let j = i - baselineWindows; j < i; j++) baselineSum += curve[j].rms
    const baseline = baselineSum / baselineWindows
    const delta = curve[i].rms - baseline
    if (delta > bestDelta) {
      bestDelta = delta
      bestDropIdx = i
    }
  }

  let dropSeconds = curve[bestDropIdx]?.time ?? trackDuration * 0.55
  if (beatTicks.length) dropSeconds = snapToNearestBeat(dropSeconds, beatTicks)

  let peakIdx = bestDropIdx
  let peakRms = curve[bestDropIdx]?.rms ?? 0
  for (let i = bestDropIdx; i < curve.length; i++) {
    if (curve[i].rms >= peakRms) {
      peakRms = curve[i].rms
      peakIdx = i
    }
  }

  let peakSeconds = curve[peakIdx]?.time ?? dropSeconds + 0.3
  if (peakSeconds <= dropSeconds) peakSeconds = Math.min(trackDuration, dropSeconds + 0.3)
  if (beatTicks.length) peakSeconds = snapToNearestBeat(peakSeconds, beatTicks)
  if (peakSeconds <= dropSeconds) peakSeconds = Math.min(trackDuration, dropSeconds + 0.3)

  const maxRms = Math.max(...curve.map(p => p.rms), 0)
  return {
    dropSeconds: Math.round(dropSeconds * 10) / 10,
    peakSeconds: Math.round(peakSeconds * 10) / 10,
    bpm: bpmFromTicks(beatTicks),
    energy: energyFromRms(maxRms),
  }
}

export function analyzeBeatWithRms(
  signal: Float32Array,
  sampleRate: number,
  beatTicks: number[] = []
): BeatAnalysisResult {
  const trimmed = trimSignal(signal, sampleRate)
  const resampled = resampleTo44100(trimmed, sampleRate)
  const derived = deriveDropAndPeak(resampled, TARGET_SAMPLE_RATE, beatTicks)
  return {
    bpm: derived.bpm,
    dropSeconds: derived.dropSeconds,
    peakSeconds: derived.peakSeconds,
    drop: derived.dropSeconds,
    peak: derived.peakSeconds,
    energy: derived.energy,
    source: beatTicks.length ? 'essentia.js' : 'rms',
  }
}

export async function analyzeBeatWithEssentia(
  signal: Float32Array,
  sampleRate: number
): Promise<BeatAnalysisResult | null> {
  try {
    const esPkg = await import('essentia.js')
    const essentia = new esPkg.Essentia(esPkg.EssentiaWASM)

    const trimmed = trimSignal(signal, sampleRate)
    const resampled = resampleTo44100(trimmed, sampleRate)
    const vector = essentia.arrayToVector(resampled)
    const beats = essentia.BeatTrackerDegara(vector)
    const ticks = essentia.vectorToArray(beats.ticks) as number[]
    essentia.delete(vector)

    const derived = deriveDropAndPeak(resampled, TARGET_SAMPLE_RATE, ticks)
    return {
      bpm: derived.bpm,
      dropSeconds: derived.dropSeconds,
      peakSeconds: derived.peakSeconds,
      drop: derived.dropSeconds,
      peak: derived.peakSeconds,
      energy: derived.energy,
      source: 'essentia.js',
    }
  } catch {
    return null
  }
}

export async function analyzeBeatFromAudioBuffer(
  channelData: Float32Array[],
  sampleRate: number
): Promise<BeatAnalysisResult> {
  const mono = toMono(channelData)
  const essentiaResult = await analyzeBeatWithEssentia(mono, sampleRate)
  if (essentiaResult) return essentiaResult
  return analyzeBeatWithRms(mono, sampleRate)
}
