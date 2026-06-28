import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

async function runManusTask(content: string, rawVideoUrl: string): Promise<string> {
  const taskRes = await fetch(MANUS_BASE + '/v2/task.create', {
    method: 'POST',
    headers: {
      'x-manus-api-key': process.env.MANUS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { content } }),
  })

  const taskData = await taskRes.json()
  if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))
  const taskId = taskData.task_id

  let finalVideoUrl = rawVideoUrl
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(MANUS_BASE + '/v2/task.listMessages?task_id=' + taskId + '&order=desc&limit=10', {
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
    }

    if (agentStatus === 'stopped') {
      const assistantMsg = messages.find((m: any) => m.type === 'assistant_message')
      const text = assistantMsg?.assistant_message?.content || ''
      const urlMatch = text.match(/https?:\/\/\S+\.mp4/i)
      if (urlMatch) finalVideoUrl = urlMatch[0]
      break
    }
    if (agentStatus === 'error') break
  }

  return finalVideoUrl
}

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const { videoUrl, mode, songName, moment } = body
    rawVideoUrl = videoUrl

    let content = ''

    if (mode === 'song') {
      content = 'I need you to sync a video to a specific song moment. Here is the video: ' + videoUrl + '. Find the song called "' + songName + '" online and download the audio. Locate the moment described as "' + moment + '" in the song. Trim a 10 to 15 second clip centered around that moment. Sync the video to that audio clip so the peak visual moment lands exactly on that moment. Export as MP4 and return only the final URL.'
    } else {
      content = 'You are a video quality reviewer. Watch this video: ' + videoUrl + '. Check if the audio and visual sync feels natural and polished. If it looks and sounds great as-is, return the original URL unchanged: ' + videoUrl + '. Only make edits if you see a genuine specific improvement — like a cut that feels off or audio that is clearly out of sync. If you do edit it, return the new MP4 URL. Return only the URL, nothing else.'
    }

    const finalVideoUrl = await runManusTask(content, rawVideoUrl)
    return NextResponse.json({ videoUrl: finalVideoUrl })

  } catch (err: any) {
    return NextResponse.json({ videoUrl: rawVideoUrl, error: err.message })
  }
}
