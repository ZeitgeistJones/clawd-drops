import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { goal, mode, clipCount = 2 } = await req.json()

    const clipPrompts = Array.from({ length: clipCount }, (_, i) => {
      if (i === 0) return `- "seedance1": First scene prompt — THE BUILD. Slow, tense, atmospheric. Subtle character action, moody lighting, slow camera. End with tension building.`
      if (i === clipCount - 1) return `- "seedance${i + 1}": Final scene prompt — THE DROP. Explosive payoff. Dynamic camera, decisive character action, dramatic lighting shift. Peak energy.`
      return `- "seedance${i + 1}": Middle scene prompt — ESCALATION. Energy rising between build and drop. More movement, increasing intensity.`
    }).join('\n')

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a neat black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered. His pyramid head is always red. His eyes are always smug and half-lidded. His bowtie is always black. These never change.

Given a goal, output ONLY a JSON object (no markdown, no explanation) with these keys:

${clipPrompts}
- "style": A short art style description extracted from the goal (e.g. "dark noir comic book style, sharp ink lines" or "pixel art, retro 16-bit, neon colors"). If no style is mentioned, default to "sharp anime style, cel shaded, high contrast, dramatic lighting".
${mode === 'auto' ? `- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.` : ''}

Always reference the character as "@Image1". Each scene prompt must include timing like "slow build for first X seconds, peak action at second Y". Make prompts cinematic and specific.

Goal: "${goal}"
Mode: "${mode}"
Clips: ${clipCount}

Return only the JSON object.`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
