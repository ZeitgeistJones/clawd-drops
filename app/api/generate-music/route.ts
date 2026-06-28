import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const res = await fetch('https://api.apiframe.ai/v2/music/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.APIFRAME_KEY!,
      },
      body: JSON.stringify({
        prompt,
        model: 'elevenlabs-music',
        elevenlabsMusicParams: {
          duration: 10,
        },
      }),
    })

    const data = await res.json()
    const jobId = data.jobId
    if (!jobId) throw new Error('No jobId: ' + JSON.stringify(data))

    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`https://api.apiframe.ai/v2/jobs/${jobId}`, {
        headers: { 'X-API-Key': process.env.APIFRAME_KEY! },
      })
      const pollData = await poll.json()
      if (pollData.status === 'COMPLETED') {
        const audioUrl = pollData.result?.audioUrl
        if (!audioUrl) throw new Error('No audioUrl: ' + JSON.stringify(pollData))
        return NextResponse.json({ audioUrl })
      }
      if (pollData.status === 'FAILED') throw new Error('Music failed: ' + JSON.stringify(pollData))
    }

    throw new Error('Music generation timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
