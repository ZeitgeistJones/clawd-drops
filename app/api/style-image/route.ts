import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, style } = await req.json()

    const imageRes = await fetch(imageUrl)
    const imageBuffer = await imageRes.arrayBuffer()

    // OpenAI requires PNG — convert by creating a File with png type
    const imageFile = new File([imageBuffer], 'character.png', { type: 'image/png' })

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: `Redraw this exact character in ${style}. Preserve the red pyramid-shaped head, smug half-lidded eyes, and black bowtie. Only change the art style.`,
      size: '1024x1024',
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('No image returned from OpenAI: ' + JSON.stringify(response))

    // Convert base64 to blob URL via Vercel Blob
    const { put } = await import('@vercel/blob')
    const buffer = Buffer.from(b64, 'base64')
    const blob = await put('styled-clawd.png', buffer, { access: 'public', contentType: 'image/png' })

    return NextResponse.json({ imageUrl: blob.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
