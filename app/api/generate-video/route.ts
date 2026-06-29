import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { prompts, imageUrl, beat, model = 'seedance-2-0-fast', duration = 5 } = await req.json()
    const safeBeat = beat || { drop: 2.0, peak: 3.5 }

    const firstPrompt = `${prompts[0]} @Image1 is the character reference. Slow atmospheric build, tension rising.`

    const res1 = await fetch('https://api.seedance2.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: firstPrompt,
          generation_type: 'reference-to-video',
          image_urls: [imageUrl],
          duration,
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

    return NextResponse.json({
      taskId1,
      prompts,
      imageUrl,
      beat: safeBeat,
      model,
      duration,
      totalClips: prompts.length,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
