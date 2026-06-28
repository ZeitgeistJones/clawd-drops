import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json()

    const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
    })
    const data = await poll.json()

    const status = data.status || data.data?.status
    const videoUrl = data.data?.results?.[0] || data.results?.[0]

    if (status === 'completed' && videoUrl) {
      return NextResponse.json({ status: 'completed', videoUrl })
    }
    if (status === 'failed') throw new Error('Seedance failed: ' + JSON.stringify(data))
    return NextResponse.json({ status: status || 'processing' })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
