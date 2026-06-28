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
        model: 'suno',
        sunoParams: {
          instrumental: true,
        },
      }),
    })

    const raw = await res.text()
    let data
    try { data = JSON.parse(raw) } catch { throw new Error('Apiframe bad response: ' + raw.slice(0, 300)) }

    const jobId = data.jobId
    if (!jobId) throw new Error('No jobId: ' + JSON.stringify(data))

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`https://api.apiframe.ai/v2/jobs/${jobId}`, {
        headers: { 'X-API-Key': process.env.APIFRAME_KEY! },
      })
      const pollRaw = await poll.text()
      let pollData
      try { pollData = JSON.parse(pollRaw) } catch { continue }

      if (pollData.status === 'done') {
        const audioUrl = pollData.result?.songs?.[0]?.audio_url || pollData.result?.audio_url
        if (!audioUrl) throw new Error('No audio URL: ' + JSON.stringify(pollData))
        return NextResponse.json({ audioUrl })
      }
      if (pollData.status === 'failed') throw new Error('Music gen failed: ' + JSON.stringify(pollData))
    }

    throw new Error('Music generation timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
