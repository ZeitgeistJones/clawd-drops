import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl, beat } = await req.json()
    const safeBeat = beat || { drop: 3, peak: 4.5 }
    const beatAwarePrompt = `${prompt} Slow build for first ${Math.round(safeBeat.drop - 1)} seconds, explosive peak action at second ${safeBeat.peak}.`

    const formData = new URLSearchParams()
    formData.append('model', 'ltx-video-2.3')
    formData.append('first_frame_image', imageUrl)
    formData.append('prompt', beatAwarePrompt)
    formData.append('frames', '120')
    formData.append('fps', '24')
    formData.append('width', '848')
    formData.append('height', '480')

    const res = await fetch('https://api.deapi.ai/api/v1/client/img2video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEAPI_KEY}`,
      },
      body: formData,
    })

    const data = await res.json()
    if (!data.id) throw new Error('No job ID: ' + JSON.stringify(data))

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const poll = await fetch(`https://api.deapi.ai/api/v1/client/img2video/${data.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.DEAPI_KEY}` },
      })
      const pollData = await poll.json()
      if (pollData.status === 'completed') {
        const videoUrl = pollData.video_url
        if (!videoUrl) throw new Error('No video URL: ' + JSON.stringify(pollData))
        return NextResponse.json({ videoUrl })
      }
      if (pollData.status === 'failed') throw new Error('deAPI failed: ' + JSON.stringify(pollData))
    }

    throw new Error('Video generation timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
