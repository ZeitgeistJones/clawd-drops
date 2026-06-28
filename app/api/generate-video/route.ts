export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl, beat } = await req.json()
    const safeBeat = beat || { drop: 3, peak: 4.5 }

    const beatAwarePrompt = `${prompt} Slow build for first ${Math.round(safeBeat.drop - 1)} seconds, explosive peak action at second ${safeBeat.peak}.`

    const res = await fetch('https://api.magichour.ai/v1/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAGIC_HOUR_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Clawd Drop',
        end_seconds: 5,
        model: 'ltx-2',
        resolution: '480p',
        assets: { image_file_path: imageUrl },
        style: { prompt: beatAwarePrompt },
      }),
    })

    const data = await res.json()
    if (!data.id) throw new Error('No job ID: ' + JSON.stringify(data))

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const poll = await fetch(`https://api.magichour.ai/v1/image-to-video/${data.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.MAGIC_HOUR_KEY}` },
      })
      const pollData = await poll.json()
      if (pollData.status === 'complete') {
        const videoUrl = pollData.downloads?.[0]?.url
        if (!videoUrl) throw new Error('No video URL: ' + JSON.stringify(pollData))
        return NextResponse.json({ videoUrl })
      }
      if (pollData.status === 'error') throw new Error('Magic Hour failed: ' + pollData.error)
    }

    throw new Error('Video generation timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
