import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl, beat } = await req.json()
    const safeBeat = beat || { drop: 2.0, peak: 3.5 }

    const beatAwarePrompt = `${prompt} @Image1 is the character reference. Slow build for first ${Math.round(safeBeat.drop - 1)} seconds, explosive peak action at second ${safeBeat.peak}.`

    const res = await fetch('https://api.seedance2.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'seedance-2-0-fast',
        input: {
          prompt: beatAwarePrompt,
          generation_type: 'reference-to-video',
          image_urls: [imageUrl],
          duration: 5,
          resolution: '480p',
          watermark: false,
          generate_audio: true,
        },
      }),
    })

    const data = await res.json()
    const taskId = data.taskId || data.id
    if (!taskId) throw new Error('Seedance task failed: ' + JSON.stringify(data))
    return NextResponse.json({ taskId })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
