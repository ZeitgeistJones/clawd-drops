import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    // GoAPI Suno - submit generation
    const res = await fetch('https://api.goapi.ai/api/suno/v1/music', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.GOAPI_KEY!,
      },
      body: JSON.stringify({
        custom_mode: false,
        mv: 'chirp-v3-5',
        input: {
          gpt_description_prompt: prompt,
          make_instrumental: true,
          duration: 8,
        },
      }),
    })

    const data = await res.json()
    if (data.code !== 200) throw new Error('GoAPI error: ' + JSON.stringify(data))
    const taskId = data.data?.task_id
    if (!taskId) throw new Error('No task ID from GoAPI')

    // Poll until complete
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(`https://api.goapi.ai/api/suno/v1/music/${taskId}`, {
        headers: { 'X-API-Key': process.env.GOAPI_KEY! },
      })
      const pollData = await poll.json()
      if (pollData.data?.status === 'complete') {
        const audioUrl = pollData.data?.clips?.[0]?.audio_url
        if (!audioUrl) throw new Error('No audio URL in response')
        return NextResponse.json({ audioUrl })
      }
      if (pollData.data?.status === 'error') throw new Error('Suno generation failed')
    }

    throw new Error('Suno timed out')
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
