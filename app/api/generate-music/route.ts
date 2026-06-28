import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const res = await fetch('https://api.apiframe.pro/suno-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.APIFRAME_KEY!,
      },
      body: JSON.stringify({
        prompt,
        instrumental: true,
        model: 'V3_5',
      }),
    })

    const raw = await res.text()
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('Apiframe bad response: ' + raw.slice(0, 200))
    }

    if (!data.task_id) throw new Error('No task ID: ' + JSON.stringify(data))
    const taskId = data.task_id

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`https://api.apiframe.pro/suno-fetch/${taskId}`, {
        headers: { 'Authorization': process.env.APIFRAME_KEY! },
      })
      const pollRaw = await poll.text()
      let pollData
      try {
        pollData = JSON.parse(pollRaw)
      } catch {
        continue
      }
      if (pollData.status === 'done') {
        const audioUrl = pollData.songs?.[0]?.audio_url
        if (!audioUrl) throw new Error('No audio URL: ' + JSON.stringify(pollData))
        return NextResponse.json({ audioUrl })
      }
      if (pollData.status === 'error') throw new Error('Apiframe failed: ' + pollData.message)
    }

    throw new Error('Music generation timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
