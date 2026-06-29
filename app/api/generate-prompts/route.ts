import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { goal, musicMode, clipCount = 2, songName } = await req.json()

    const clipPrompts = Array.from({ length: clipCount }, (_, i) => {
      if (i === 0) return `- "seedance1": First scene — THE BUILD. Slow, tense, atmospheric. Subtle character action, moody lighting, slow camera. End with tension building.`
      if (i === clipCount - 1) return `- "seedance${i + 1}": Final scene — THE DROP. Explosive payoff. Dynamic camera, decisive action, dramatic lighting shift. Peak energy.`
      return `- "seedance${i + 1}": Middle scene — ESCALATION. Energy rising between build and drop. More movement, increasing intensity.`
    }).join('\n')

    // If generating goal from song name
    const goalSection = goal
      ? `Goal: "${goal}"`
      : `Generate a visual goal that matches the mood, energy, and atmosphere of the song "${songName}". Think about what the song feels like visually — the pacing, the emotion, the setting. Write the goal in first person as if describing what should happen in the video.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a creative director for AI video generation. The character in the reference image (@Image1) is Clawd — a red pyramid-headed figure with smug half-lidded eyes and a neat black bowtie. Clawd is the mascot of the CLAWD token on Base blockchain. He is confident, mysterious, and always unbothered. His red pyramid head, smug eyes, and black bowtie never change — only his outfit, setting, and art style vary.

${goalSection}

Output ONLY a JSON object (no markdown, no explanation) with these keys:

${clipPrompts}
- "style": A short art style description extracted from the goal (e.g. "dark noir comic book style, sharp ink lines" or "pixel art, retro 16-bit"). If no style is specified, default to "sharp anime style, cel shaded, high contrast, dramatic lighting".
- "generatedGoal": If no goal was provided and you generated one from the song, include it here. Otherwise omit this key.
${musicMode === 'ai' ? `- "suno": A music generation prompt. Instrumental only, 8 seconds, no vocals. Match the energy of the goal.` : ''}

Always reference the character as "@Image1". Each scene prompt must include timing. Make prompts cinematic and specific.

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
