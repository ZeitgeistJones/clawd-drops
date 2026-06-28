import { NextRequest, NextResponse } from 'next/server'

const CLAWD_REFERENCE = 'https://raw.githubusercontent.com/ZeitgeistJones/clawd-drops/main/clawd.jpg'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const res = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${process.env.FAL_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: `${prompt}, same character as reference image, maintain red pyramid head shape and smug expression`,
        image_url: CLAWD_REFERENCE,
        strength: 0.75,
        num_inference_steps: 28,
        num_images: 1,
      }),
    })

    const data = await res.json()
    const imageUrl = data.images?.[0]?.url
    if (!imageUrl) throw new Error('Flux returned no image: ' + JSON.stringify(data))

    return NextResponse.json({ imageUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
