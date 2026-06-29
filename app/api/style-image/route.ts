import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, style } = await req.json()

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) throw new Error('Failed to fetch image')
    const imageBuffer = await imageRes.arrayBuffer()

    // OpenAI requires PNG
    const imageFile = new File([imageBuffer], 'character.png', { type: 'image/png' })

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: `Redraw this exact character in ${style}. The character has a red pyramid-shaped head, smug half-lidded eyes, and a black bowtie. These features must be preserved exactly. Only change the art style, background, and outfit to match the style description. Do not change the character's identity.`,
      size: '1024x1024',
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('No image returned from OpenAI: ' + JSON.stringify(response))

    const { put } = await import('@vercel/blob')
    const buffer = Buffer.from(b64, 'base64')
    const blob = await put(`styled-clawd-${Date.now()}.png`, buffer, { access: 'public', contentType: 'image/png' })

    return NextResponse.json({ imageUrl: blob.url })
  } catch (err: any) {
    // Graceful fallback — return error so UI can use original image
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
