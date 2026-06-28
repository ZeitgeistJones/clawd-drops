import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json()

    const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
    })
    const data = await poll.json()

    if (data.status === 'completed') {
      const videoUrl = data.data?.results?.[0]
      if (!videoUrl) throw new Error('No video URL: ' + JSON.stringify(data))
      return NextResponse.json({ status: 'completed', videoUrl })
    }
    if (data.status === 'failed') throw new Error('Seedance failed: ' + data.failed_reason)
    return NextResponse.json({ status: data.status })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
