import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { goal, mode } = await req.json()

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered.

Given a goal, output ONLY a JSON object (no markdown, no explanation) with these keys:

- "seedance1": First scene prompt for Seedance AI. This is the BUILD — slow, tense, atmospheric. Describe a slow camera move, subtle character action, moody lighting. Always reference character as "@Image1". End with tension building. 3-5 seconds of slow burn energy.
- "seedance2": Second scene prompt for Seedance AI. This is the DROP — explosive, dynamic, peak energy. Picks up exactly where seedance1 left off. Camera cuts or pushes hard, character makes a decisive action, lighting shifts dramatically. Always reference character as "@Image1". This is the payoff moment.
- "style": A short art style description extracted from the goal (e.g. "dark noir comic book style, sharp ink lines" or "pixel art, retro 16-bit, neon colors"). If no style is mentioned, default to "sharp anime style, high contrast, dramatic lighting".
${mode === 'auto' ? `- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.` : ''}

Goal: "${goal}"
Mode: "${mode}"

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
