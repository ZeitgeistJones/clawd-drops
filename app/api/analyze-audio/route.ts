import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { audioUrl } = await req.json()

    // Use Claude to estimate beat structure from the suno prompt context
    // For real beat analysis, swap this with ACRCloud or Audd.io
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Given an 8-second music track URL: ${audioUrl}

Estimate realistic beat data for this track. Return ONLY a JSON object with:
- "bpm": integer between 90-160
- "drop": float — timestamp in seconds where energy peaks or drops (between 3.0 and 6.0)
- "peak": float — timestamp of single most impactful moment (between 4.0 and 7.0, must be after drop)
- "energy": string, one of: "low", "medium", "high", "extreme"

Return only the JSON object.`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const beat = JSON.parse(clean)
    return NextResponse.json(beat)
  } catch (err: any) {
    // Fallback beat data if analysis fails
    return NextResponse.json({ bpm: 128, drop: 4.2, peak: 5.8, energy: 'high' })
  }
}
