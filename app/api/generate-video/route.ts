import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const { videoUrl, audioUrl, beat } = await req.json()
    rawVideoUrl = videoUrl

    const content = `Sync this video to this audio with frame-perfect timing. Video: ${videoUrl} Audio: ${audioUrl} Peak moment should land at ${beat?.peak || 5}s. Download both files, sync them, export as MP4, return only the final URL.`

    const requestBody = JSON.stringify({
      message: { content }
    })

    console.log('Manus request body:', requestBody)

    const taskRes = await fetch(`${MANUS_BASE}/v2/task.create`, {
      method: 'POST',
      headers: {
        'x-manus-api-key': process.env.MANUS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: requestBody,
    })

    const taskData = await taskRes.json()
    if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))
    const taskId = taskData.task_id

    let finalVideoUrl = videoUrl
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const pollRes = await fetch(`${MANUS_BASE}/v2/task.listMessages?task_id=${taskId}&order=desc&limit=10`, {
        headers: { 'x-manus-api-key': process.env.MANUS_API_KEY! },
      })
      const pollData = await pollRes.json()
      const messages = pollData.messages || []
      const statusEvent = messages.find((m: any) => m.type === 'status_update')
      const agentStatus = statusEvent?.status_update?.agent_status

      if (agentStatus === 'waiting') {
        const detail = statusEvent?.status_update?.status_detail
        const eventType = detail?.waiting_for_event_type
        const eventId = detail?.waiting_for_event_id
        if (eventType === 'videoGenerate') {
          await fetch(`${MANUS_BASE}/v2/task.confirmAction`, {
            method: 'POST',
            headers: { 'x-manus-api-key': process.env.MANUS_API_KEY!, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { choice: 'standard' } }),
          })
        } else if (eventType === 'apiHighCreditNotice') {
          await fetch(`${MANUS_BASE}/v2/task.confirmAction`, {
            method: 'POST',
            headers: { 'x-manus-api-key': process.env.MANUS_API_KEY!, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { action: 'accept' } }),
          })
        } else if (eventType === 'terminalExecute') {
          await fetch(`${MANUS_BASE}/v2/task.confirmAction`, {
            method: 'POST',
            headers: { 'x-manus-api-key': process.env.MANUS_API_KEY!, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { accept: true, always_allow: true } }),
          })
        }
      }

      if (agentStatus === 'stopped') {
        const assistantMsg = messages.find((m: any) => m.type === 'assistant_message')
        const content = assistantMsg?.assistant_message?.content || ''
        const urlMatch = content.match(/https?:\/\/\S+\.mp4/i)
        if (urlMatch) finalVideoUrl = urlMatch[0]
        break
      }
      if (agentStatus === 'error') break
    }

    return NextResponse.json({ videoUrl: finalVideoUrl })
  } catch (err: any) {
    return NextResponse.json({ videoUrl: rawVideoUrl, error: err.message })
  }
}
