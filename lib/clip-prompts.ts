import { castReferencePromptSuffix } from './cast-references'

export type ParsedStructuredGoal = {
  style?: string
  clips: string[]
  structured: boolean
}

const DEFAULT_STYLE =
  'sharp anime style, cel shaded, high contrast, dramatic lighting'

const SECTION_HEADER =
  /^(BUILD(?:\s*→\s*DROP)?|DROP|ESCALATION|MIDDLE(?:\s+CLIP)?|CLIP\s*(\d+)|STYLE)\s*(?:\([^)]*\))?\s*:\s*(.*)$/i

function normalizeLabel(label: string): string {
  return label.toUpperCase().replace(/\s+/g, ' ')
}

function mergeSingleClipSections(buildPart: string, dropPart: string): string {
  const build = buildPart.trim()
  const drop = dropPart.trim()
  if (build && drop) {
    return `BUILD phase: ${build} Then DROP phase: ${drop}`
  }
  return build || drop
}

export function parseStructuredGoal(goal: string, clipCount: number): ParsedStructuredGoal {
  const clips = Array.from({ length: clipCount }, () => '')
  let style: string | undefined
  let currentKey: 'style' | 'build' | 'drop' | number | null = null
  const buffer: string[] = []
  let singleBuild = ''
  let singleDrop = ''

  const flush = () => {
    const text = buffer.join('\n').trim()
    if (currentKey === 'style') {
      if (text) style = text
    } else if (clipCount === 1 && currentKey === 'build') {
      if (text) singleBuild = text
    } else if (clipCount === 1 && currentKey === 'drop') {
      if (text) singleDrop = text
    } else if (
      typeof currentKey === 'number'
      && currentKey >= 0
      && currentKey < clipCount
    ) {
      if (text) clips[currentKey] = text
    }
    buffer.length = 0
  }

  for (const line of goal.split(/\r?\n/)) {
    const match = line.match(SECTION_HEADER)
    if (match) {
      flush()
      const label = normalizeLabel(match[1])
      const inline = match[3]?.trim() || ''

      if (label === 'STYLE') {
        currentKey = 'style'
        if (inline) buffer.push(inline)
      } else if (label === 'BUILD' || label.startsWith('BUILD→DROP') || label.startsWith('BUILD->DROP')) {
        if (clipCount === 1) {
          currentKey = 'build'
        } else {
          currentKey = 0
        }
        if (inline) buffer.push(inline)
      } else if (label === 'DROP') {
        if (clipCount === 1) {
          currentKey = 'drop'
        } else {
          currentKey = clipCount - 1
        }
        if (inline) buffer.push(inline)
      } else if (label.startsWith('CLIP')) {
        const clipNum = parseInt(match[2], 10)
        currentKey = Number.isFinite(clipNum) ? clipNum - 1 : null
        if (inline) buffer.push(inline)
      } else if (label === 'ESCALATION' || label.startsWith('MIDDLE')) {
        currentKey = clipCount > 2 ? 1 : clipCount - 1
        if (inline) buffer.push(inline)
      } else {
        currentKey = null
      }
    } else if (currentKey !== null) {
      buffer.push(line)
    }
  }
  flush()

  if (clipCount === 1) {
    clips[0] = mergeSingleClipSections(singleBuild, singleDrop)
  }

  const filledCount = clips.filter(Boolean).length
  const hasBuildDrop = clipCount >= 2 && Boolean(clips[0] && clips[clipCount - 1])
  const hasSingleArc = clipCount === 1 && Boolean(clips[0])

  return {
    style,
    clips,
    structured: filledCount >= clipCount || hasBuildDrop || hasSingleArc,
  }
}

export function buildStructuredClipPrompts(
  parsed: ParsedStructuredGoal,
  clipCount: number,
  clipDurations: number[]
): Record<string, string> {
  const result: Record<string, string> = {
    style: parsed.style || DEFAULT_STYLE,
    clipPromptSource: 'structured',
  }

  for (let i = 0; i < clipCount; i++) {
    const duration = clipDurations[i] ?? clipDurations[0] ?? 8
    const body = parsed.clips[i]?.trim()
    if (!body) continue

    const role = clipRoleLabel(i, clipCount)
    result[`seedance${i + 1}`] =
      `${body} (${duration}s ${role.toLowerCase()} — @Image1 is the main character, same identity throughout)`
  }

  return result
}

export function clipDurationNote(
  clipIndex: number,
  totalClips: number,
  durationSeconds: number
): string {
  if (totalClips === 1) {
    const buildSec = Math.max(2, Math.round(durationSeconds * 0.6))
    const dropSec = Math.max(2, durationSeconds - buildSec)
    return `${durationSeconds}s one-shot — first ~${buildSec}s slow BUILD (tension rising), final ~${dropSec}s explosive DROP on the beat.`
  }
  if (clipIndex === 0) {
    return `${durationSeconds}s clip — slow atmospheric BUILD, tension rising, end on anticipation.`
  }
  if (clipIndex === totalClips - 1) {
    return `${durationSeconds}s clip — THE DROP: explosive peak energy, dramatic lighting shift, hero action.`
  }
  return `${durationSeconds}s clip — ESCALATION, energy rising toward the drop.`
}

export function wrapVideoClipPrompt(
  prompt: string,
  clipIndex: number,
  totalClips: number,
  durationSeconds: number,
  options?: { continuesFromPriorFrame?: boolean; supportingRefCount?: number }
): string {
  const trimmed = prompt.trim()
  const hasImageRef = trimmed.includes('@Image1')
  const base = hasImageRef
    ? trimmed
    : `${trimmed} @Image1 is the character reference.`

  const castSuffix = castReferencePromptSuffix(options?.supportingRefCount ?? 0)
  const withCast = castSuffix && !trimmed.includes('@Image2') ? `${base}${castSuffix}` : base

  const timing = clipDurationNote(clipIndex, totalClips, durationSeconds)

  if (totalClips === 1) {
    return `${withCast} ${timing}`
  }

  if (clipIndex === 0) {
    return `${withCast} ${timing}`
  }

  const continuity = options?.continuesFromPriorFrame !== false
    ? ' Same location, same character, same outfit — continue seamlessly from the prior frame.'
    : ''

  if (clipIndex === totalClips - 1) {
    return `${withCast} ${timing}${continuity}`
  }

  return `${withCast} ${timing}${continuity}`
}

export function clipRoleLabel(clipIndex: number, totalClips: number): string {
  if (totalClips === 1) return 'BUILD → DROP'
  if (clipIndex === 0) return 'BUILD'
  if (clipIndex === totalClips - 1) return 'DROP'
  return `ESCALATION ${clipIndex}`
}

export function durationHintsForPrompts(clipDurations: number[], clipCount: number): string {
  return Array.from({ length: clipCount }, (_, i) => {
    const seconds = clipDurations[i] ?? 8
    const role = clipRoleLabel(i, clipCount)
    return `Clip ${i + 1} (${role}): ${seconds} seconds`
  }).join('\n')
}

export { DEFAULT_STYLE }
