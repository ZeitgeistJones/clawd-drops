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
    const { videoUrl1, videoUrl2, mode, songName, moment, beat } = body
    rawVideoUrl = videoUrl1

    let content = ''

    if (mode === 'song') {
      content = '/video-sync Here are two video clips to edit together: Clip 1 (the build): ' + videoUrl1 + ' Clip 2 (the drop): ' + videoUrl2 + '. Find the song "' + songName + '" on SoundCloud and download the audio. Locate the moment described as "' + moment + '". Cut from clip 1 to clip 2 exactly at that moment. Sync so the cut lands on the beat. Export as MP4 and return only the final URL.'
    } else {
      content = '/video-sync Here are two video clips: Clip 1 (the build): ' + videoUrl1 + ' Clip 2 (the drop): ' + videoUrl2 + '. Cut from clip 1 to clip 2 at the most impactful moment around second ' + (beat?.drop || 2) + '. Review the final edit — if it looks and sounds polished return the URL, if not make targeted improvements. Return only the final MP4 URL.'
    }

    const finalVideoUrl = await runManusTask(content, rawVideoUrl)
    return NextResponse.json({ videoUrl: finalVideoUrl })

  } catch (err: any) {
    return NextResponse.json({ videoUrl: rawVideoUrl, error: err.message })
  }
}
