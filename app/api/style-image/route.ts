import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, style } = await req.json()

    // Fetch the image and convert to buffer
    const imageRes = await fetch(imageUrl)
    const imageBuffer = await imageRes.arrayBuffer()
    const imageFile = new File([imageBuffer], 'character.png', { type: 'image/png' })

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: `Redraw this character in ${style}. Keep the exact same character — red pyramid head, smug half-lidded eyes, black bowtie. Only change the art style, not the character identity.`,
      size: '1024x1024',
    })

    const styledImageUrl = response.data[0].url
    if (!styledImageUrl) throw new Error('No image returned')
    return NextResponse.json({ imageUrl: styledImageUrl })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
