import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl, beat } = await req.json()

    const safeBeat = beat || { drop: 3, peak: 4.5 }
    const beatAwarePrompt = `${prompt} @Image1 is the character reference. Slow build for first ${Math.round(safeBeat.drop - 1)} seconds, explosive peak action at second ${safeBeat.peak}.`

    const res = await fetch('https://fal.run/bytedance/seedance-2.0/reference-to-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${process.env.FAL_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: beatAwarePrompt,
        image_urls: [imageUrl],
        duration: '5',
        resolution: '480p',
        aspect_ratio: '16:9',
        generate_audio: true,
      }),
    })

    const data = await res.json()
    const videoUrl = data.video?.url
    if (!videoUrl) throw new Error('Fal returned no video: ' + JSON.stringify(data))
    return NextResponse.json({ videoUrl })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
