import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const {
      goal,
      musicMode,
      clipCount = 2,
      outputMode = 'video',
      poseCount = 5,
    } = await req.json()

    const isFlipbook = outputMode === 'flipbook'
    const count = isFlipbook ? Math.min(6, Math.max(2, poseCount)) : clipCount

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
        if (i === 0) return `- "seedance1": First scene — THE BUILD. Slow, tense, atmospheric. Subtle character action, moody lighting, slow camera. End with tension building.`
        if (i === count - 1) return `- "seedance${i + 1}": Final scene — THE DROP. Explosive payoff. Dynamic camera, decisive action, dramatic lighting shift. Peak energy.`
        return `- "seedance${i + 1}": Middle scene — ESCALATION. Energy rising between build and drop. More movement, increasing intensity.`
      }).join('\n')
    }

    const modeInstructions = isFlipbook
      ? `Output mode: FLIPBOOK. Write ${count} pose/moment prompts describing Clawd's emotional arc through still poses. Focus on body language and expression — no camera directions, no video motion language.`
      : `Output mode: VIDEO. Write ${count} cinematic video scene prompts with timing.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a neat black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered. His red pyramid head, smug eyes, and black bowtie never change — only his outfit, setting, and art style vary.

Goal: "${goal}"

${modeInstructions}

Output ONLY a JSON object (no markdown, no explanation) with these keys:

${promptKeys}
- "style": A short art style description extracted from the goal (e.g. "dark noir comic book style, sharp ink lines" or "pixel art, retro 16-bit"). If no style is specified, default to "sharp anime style, cel shaded, high contrast, dramatic lighting".
${isFlipbook ? `- "frameCount": ${count}` : ''}
${musicMode === 'ai' ? `- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.` : ''}

Always reference the character as "@Image1". Make prompts specific to the goal.

Return only the JSON object.`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Prompt generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
