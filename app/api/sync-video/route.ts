import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    rawVideoUrl = body.videoUrl

    const content = 'Download this video: ' + body.videoUrl + ' and this audio: ' + body.audioUrl + ' then sync them together and return the final MP4 URL.'

    const requestBody = {
      message: {
        content: content
      }
    }

    const taskRes = await fetch('https://api.manus.ai/v2/task.create', {
      method: 'POST',
      headers: {
        'x-manus-api-key': process.env.MANUS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const taskData = await taskRes.json()
    if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))
    const taskId = taskData.task_id

    let finalVideoUrl = rawVideoUrl
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const pollRes = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${taskId}&order=desc&limit=10`, {
        headers: { 'x-manus-api-key': process.env.MANUS_API_KEY! },
      })
      const pollData = await pollRes.json()
      const messages = pollData.messages || []
      const statusEvent = messages.find((m: any) => m.type === 'status_update')
      const agentStatus = statusEvent?.status_update?.agent_status

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
