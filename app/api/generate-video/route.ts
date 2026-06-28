import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl, audioUrl, beat } = await req.json()

    const beatAwarePrompt = `${prompt} @Image1 is the character reference. @Audio1 is the soundtrack. Slow build for first ${Math.round(beat.drop - 1)} seconds, explosive peak action at second ${beat.peak}, sync visual impact to audio drop at ${beat.drop}s.`

    const res = await fetch('https://api.seedance2.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'seedance-2-0',
        input: {
          prompt: beatAwarePrompt,
          generation_type: 'reference-to-video',
          image_urls: [imageUrl],
          audio_urls: [audioUrl],
          duration: 8,
          resolution: '720p',
          watermark: false,
        },
      }),
    })

    const data = await res.json()
    if (!data.id) throw new Error('Seedance task failed: ' + JSON.stringify(data))
    const taskId = data.id

    // Poll until complete
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
      })
      const pollData = await poll.json()
      if (pollData.status === 'completed') {
        const videoUrl = pollData.data?.results?.[0]
        if (!videoUrl) throw new Error('No video URL in response')
        return NextResponse.json({ videoUrl })
      }
      if (pollData.status === 'failed') throw new Error('Seedance failed: ' + pollData.failed_reason)
    }

    throw new Error('Seedance timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
