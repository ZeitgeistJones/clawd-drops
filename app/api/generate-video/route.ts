import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { prompt1, prompt2, imageUrl, beat } = await req.json()
    const safeBeat = beat || { drop: 2.0, peak: 3.5 }

    const beatPrompt1 = `${prompt1} @Image1 is the character reference. Slow atmospheric build, tension rising.`

    const res1 = await fetch('https://api.seedance2.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'seedance-2-0-fast',
        input: {
          prompt: beatPrompt1,
          generation_type: 'reference-to-video',
          image_urls: [imageUrl],
          duration: 5,
          resolution: '480p',
          watermark: false,
          generate_audio: true,
          return_last_frame: true,
        },
      }),
    })

    const data1 = await res1.json()
    const taskId1 = data1.taskId || data1.id
    if (!taskId1) throw new Error('Clip 1 failed: ' + JSON.stringify(data1))

    return NextResponse.json({ taskId1, prompt2, imageUrl, beat: safeBeat })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
