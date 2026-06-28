import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { goal, mode } = await req.json()

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered.

Given a goal, output ONLY a JSON object (no markdown, no explanation) with these keys:

- "seedance": A video scene prompt for Seedance AI. Describe camera movement, character action, lighting, and energy arc. Always reference the character as "@Image1". Must include timing like "slow build for first X seconds, peak action at second Y". Make it cinematic and specific.
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
