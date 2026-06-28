import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { goal } = await req.json()

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. Given a goal, output ONLY a JSON object (no markdown, no explanation) with three keys:

- "flux": A character image generation prompt for Clawd, a red pyramid-headed character with smug half-lidded eyes and a neat black bowtie. Describe his outfit, pose, lighting, and style for this specific goal. Always anime-influenced, high contrast, sharp lines. Never misspell as "claude".
- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.
- "seedance": A video scene prompt. Describe camera movement, character action, lighting changes, and energy arc. Must reference "slow build for first X seconds, peak action at second Y" based on the goal energy. Use @Image1 for the character reference and @Audio1 for the audio.

Goal: "${goal}"

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
