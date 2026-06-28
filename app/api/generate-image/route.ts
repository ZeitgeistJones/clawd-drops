import { NextRequest, NextResponse } from 'next/server'

const CLAWD_REFERENCE = 'https://raw.githubusercontent.com/ZeitgeistJones/clawd-drops/main/clawd.jpg'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    // Submit to Replicate
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: `${prompt}, same character as reference, red pyramid head, smug expression`,
          go_fast: true,
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'webp',
          num_inference_steps: 4,
        },
      }),
    })

    const data = await res.json()
    const imageUrl = data.output?.[0]
    if (!imageUrl) throw new Error('Replicate returned no image: ' + JSON.stringify(data))

    return NextResponse.json({ imageUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
