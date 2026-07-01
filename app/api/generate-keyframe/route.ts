import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { filterSupportingUrls } from '../../../lib/cast-references'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function describeReferenceImage(url: string, label: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url } },
        {
          type: 'text',
          text: `Describe ${label} for image generation consistency: age range, skin tone, hair (color, length, style), outfit (colors, garments), and distinguishing features. One dense sentence, no preamble.`,
        },
      ],
    }],
  })
  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function POST(req: NextRequest) {
  try {
    const {
      styledImageUrl,
      supportingImageUrls,
      sceneDescription,
      style = 'ultra-cinematic realism, luxury fashion editorial',
    } = await req.json()

    if (!styledImageUrl || typeof styledImageUrl !== 'string') {
      return NextResponse.json({ error: 'No styled image URL' }, { status: 400 })
    }
    if (!sceneDescription || typeof sceneDescription !== 'string') {
      return NextResponse.json({ error: 'No scene description' }, { status: 400 })
    }

    const supportUrls = filterSupportingUrls(
      Array.isArray(supportingImageUrls) ? supportingImageUrls : []
    )

    const supportDescriptions: string[] = []
    for (let i = 0; i < supportUrls.length; i++) {
      const desc = await describeReferenceImage(supportUrls[i], `supporting character ${i + 1}`)
      if (desc) supportDescriptions.push(desc)
    }

    const imageRes = await fetch(styledImageUrl)
    if (!imageRes.ok) throw new Error('Failed to fetch styled character image')
    const imageBuffer = await imageRes.arrayBuffer()
    const imageFile = new File([imageBuffer], 'character.png', { type: 'image/png' })

    const castBlock = supportDescriptions.length > 0
      ? ` Include exactly ${supportDescriptions.length} supporting character(s) in the scene with these exact looks: ${supportDescriptions.map((d, i) => `Character ${i + 1}: ${d}`).join(' ')}`
      : ''

    const editPrompt = [
      `Create one cinematic keyframe still in ${style}.`,
      sceneDescription.trim(),
      'The main character from the input image must appear center-stage — preserve the red pyramid-shaped head, smug half-lidded eyes, and black bowtie exactly.',
      castBlock,
      'Single wide cinematic frame — all characters in the same shot, same lighting, luxury urban environment. No collage, no split panels.',
    ].filter(Boolean).join(' ')

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: editPrompt,
      size: '1024x1024',
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('No keyframe returned from OpenAI')

    const { put } = await import('@vercel/blob')
    const buffer = Buffer.from(b64, 'base64')
    const blob = await put(`keyframe-${Date.now()}.png`, buffer, {
      access: 'public',
      contentType: 'image/png',
    })

    return NextResponse.json({
      imageUrl: blob.url,
      supportDescriptions,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Keyframe generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
