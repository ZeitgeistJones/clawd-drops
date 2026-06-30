import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, style, posePrompt } = await req.json()

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) throw new Error('Failed to fetch image')
    const imageBuffer = await imageRes.arrayBuffer()
    const imageFile = new File([imageBuffer], 'character.png', { type: 'image/png' })

    const poseClause = posePrompt ? `${posePrompt}. ` : ''
    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: `Redraw this exact character in ${style}. ${poseClause}The character has a red pyramid-shaped head, smug half-lidded eyes, and a black bowtie. These features must be preserved exactly. Only change the art style, background, pose, and outfit as described.`,
      size: '1024x1024',
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('No image returned from OpenAI')

    const { put } = await import('@vercel/blob')
    const buffer = Buffer.from(b64, 'base64')
    const prefix = posePrompt ? 'flipbook-frame' : 'styled-clawd'
    const blob = await put(`${prefix}-${Date.now()}.png`, buffer, { access: 'public', contentType: 'image/png' })

    return NextResponse.json({ imageUrl: blob.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Style edit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
