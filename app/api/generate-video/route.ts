import { NextRequest, NextResponse } from 'next/server'

const MANUS_KEY = process.env.MANUS_API_KEY!
const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, audioUrl, beat } = await req.json()

    const taskRes = await fetch(`${MANUS_BASE}/v2/task.create`, {
      method: 'POST',
      headers: {
        'x-manus-api-key': MANUS_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          content: `You are a video sync specialist. Sync this video to the audio with frame-perfect timing.

Video URL: ${videoUrl}
Audio URL: ${audioUrl}

Beat analysis:
- BPM: ${beat.bpm}
- Drop timestamp: ${beat.drop}s
- Peak timestamp: ${beat.peak}s
- Energy: ${beat.energy}

Instructions:
1. Download the video and audio files
2. Sync video cuts so the most impactful visual moment lands at exactly ${beat.peak}s
3. Ensure audio drop at ${beat.drop}s aligns with a visual cut or effect
4. Export the final synced video as MP4
5. Return only the final output file URL — nothing else

No explanations. Sync it and return the MP4 URL.`,
        },
      }),
    })

    const taskData = await taskRes.json()
    if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))
    const taskId = taskData.task_id

    let finalVideoUrl = videoUrl
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const pollRes = await fetch(`${MANUS_BASE}/v2/task.listMessages?task_id=${taskId}&order=desc&limit=10`, {
        headers: { 'x-manus-api-key': MANUS_KEY },
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
            headers: { 'x-manus-api-key': MANUS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { choice: 'standard' } }),
          })
        } else if (eventType === 'apiHighCreditNotice') {
          await fetch(`${MANUS_BASE}/v2/task.confirmAction`, {
            method: 'POST',
            headers: { 'x-manus-api-key': MANUS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId, event_id: eventId, input: { action: 'accept' } }),
          })
        } else if (eventType === 'terminalExecute') {
          await fetch(`${MANUS_BASE}/v2/task.confirmAction`, {
            method: 'POST',
            headers: { 'x-manus-api-key': MANUS_KEY, 'Content-Type': 'application/json' },
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

      if (agentStatus === 'error') {
        console.error('Manus error — falling back to raw video')
        break
      }
    }

    return NextResponse.json({ videoUrl: finalVideoUrl })
  } catch (err: any) {
    const body = await req.json().catch(() => ({ videoUrl: null }))
    return NextResponse.json({ videoUrl: body.videoUrl, error: err.message })
  }
}
