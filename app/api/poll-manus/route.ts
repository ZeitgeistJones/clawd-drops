import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  try {
    const { taskId, rawVideoUrl } = await req.json()

    const pollRes = await fetch(MANUS_BASE + '/v2/task.listMessages?task_id=' + taskId + '&order=desc&limit=10', {
      headers: { 'x-manus-api-key': process.env.MANUS_API_KEY! },
    })
    const pollData = await pollRes.json()
    const messages = pollData.messages || []
    const statusEvent = messages.find((m: any) => m.type === 'status_update')
    const agentStatus = statusEvent?.status_update?.agent_status

    // Handle waiting states
    if (agentStatus === 'waiting') {
      const detail = statusEvent?.status_update?.status_detail
      const eventType = detail?.waiting_for_event_type
      const eventId = detail?.waiting_for_event_id
      if (eventType === 'terminalExecute') {
        await fetch(MANUS_BASE + '/v2/task.confirmAction', {
          method: 'POST',
          headers: { 'x-manus-api-key': process.env.MANUS_API_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { accept: true, always_allow: true } }),
        })
      } else if (eventType === 'apiHighCreditNotice') {
        await fetch(MANUS_BASE + '/v2/task.confirmAction', {
          method: 'POST',
          headers: { 'x-manus-api-key': process.env.MANUS_API_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { action: 'accept' } }),
        })
      }
      return NextResponse.json({ status: 'waiting' })
    }

    if (agentStatus === 'stopped') {
      const assistantMsg = messages.find((m: any) => m.type === 'assistant_message')
      const text = assistantMsg?.assistant_message?.content || ''
      const urlMatch = text.match(/https?:\/\/\S+\.mp4/i)
      const videoUrl = urlMatch ? urlMatch[0] : rawVideoUrl
      return NextResponse.json({ status: 'completed', videoUrl })
    }

    if (agentStatus === 'error') {
      return NextResponse.json({ status: 'completed', videoUrl: rawVideoUrl })
    }

    return NextResponse.json({ status: agentStatus || 'processing' })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
