import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildStructuredClipPrompts,
  DEFAULT_STYLE,
  durationHintsForPrompts,
  parseStructuredGoal,
} from '../../../lib/clip-prompts'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function normalizeClipDurations(raw: unknown, clipCount: number): number[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return Array.from({ length: clipCount }, (_, i) => {
      const n = Number(raw[i] ?? raw[raw.length - 1])
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 8
    })
  }
  return Array.from({ length: clipCount }, () => 8)
}

export async function POST(req: NextRequest) {
  try {
    const {
      goal,
      musicMode,
      clipCount = 2,
      clipDurations: rawClipDurations,
      outputMode = 'video',
      poseCount = 5,
    } = await req.json()

    const isFlipbook = outputMode === 'flipbook'
    const count = isFlipbook ? Math.min(6, Math.max(2, poseCount)) : clipCount
    const clipDurations = normalizeClipDurations(rawClipDurations, count)

    if (!isFlipbook) {
      const parsed = parseStructuredGoal(typeof goal === 'string' ? goal : '', count)
      if (parsed.structured) {
        const structured = buildStructuredClipPrompts(parsed, count, clipDurations)
        const keys = Array.from({ length: count }, (_, i) => `seedance${i + 1}`)
        if (keys.every(key => typeof structured[key] === 'string')) {
          return NextResponse.json(structured)
        }
      }
    }

    let promptKeys = ''
    if (isFlipbook) {
      promptKeys = Array.from({ length: count }, (_, i) => {
        const n = i + 1
        if (n === 1) return `- "flipbook${n}": First pose — tension building. Sitting tensely, coiled energy.`
        if (n === count) return `- "flipbook${n}": Final pose — THE PAYOFF. Smug grin, satisfied, decisive.`
        if (n === count - 1) return `- "flipbook${n}": Release — leaning back, exhaling, tension breaking.`
        return `- "flipbook${n}": Escalation pose ${n} — emotional beat in the arc (leaning forward, reacting, decisive action).`
      }).join('\n')
    } else {
      promptKeys = Array.from({ length: count }, (_, i) => {
        const seconds = clipDurations[i] ?? 8
        if (i === 0) {
          return `- "seedance1": Clip 1 — THE BUILD (${seconds}s). Slow, tense, atmospheric. Subtle character action, moody lighting, slow camera. End with tension building. Do NOT include drop or explosion yet.`
        }
        if (i === count - 1) {
          return `- "seedance${i + 1}": Clip ${i + 1} — THE DROP (${seconds}s). Explosive payoff on the beat. Dynamic camera, decisive action, dramatic lighting shift, peak energy. Same location and character as clip 1.`
        }
        return `- "seedance${i + 1}": Clip ${i + 1} — ESCALATION (${seconds}s). Energy rising between build and drop. More movement, increasing intensity. Same location and character.`
      }).join('\n')
    }

    const modeInstructions = isFlipbook
      ? `Output mode: FLIPBOOK. Write ${count} pose/moment prompts describing Clawd's emotional arc through still poses. Focus on body language and expression — no camera directions, no video motion language.`
      : `Output mode: VIDEO. Write ${count} distinct cinematic video scene prompts — one per clip. Each prompt must match its clip role (build vs escalation vs drop). Keep the same setting and character across all clips.`

    const durationBlock = isFlipbook
      ? ''
      : `\nClip timing:\n${durationHintsForPrompts(clipDurations, count)}\n`

    const structuredHint = !isFlipbook
      ? `\nIf the goal uses BUILD / DROP / CLIP N / STYLE sections, honor them literally — do not merge build and drop into one prompt.\n`
      : ''

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a neat black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered. His red pyramid head, smug eyes, and black bowtie never change — only his outfit, setting, and art style vary.

Goal: "${goal}"
${durationBlock}${structuredHint}
${modeInstructions}

Output ONLY a JSON object (no markdown, no explanation) with these keys:

${promptKeys}
- "style": A short art style description extracted from the goal (e.g. "dark noir comic book style, sharp ink lines" or "pixel art, retro 16-bit"). If no style is specified, default to "${DEFAULT_STYLE}".
${isFlipbook ? `- "frameCount": ${count}` : ''}
${musicMode === 'ai' ? `- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.` : ''}

Always reference the character as "@Image1". Make each clip prompt specific and visually distinct. Build clips must stay slow and tense; drop clips must be explosive.

Return only the JSON object.`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json({ ...parsed, clipPromptSource: 'generated' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Prompt generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
