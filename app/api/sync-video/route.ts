import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const { clips, mode, songName, moment, beat } = body
    rawVideoUrl = clips?.[0]

    if (!clips || clips.length === 0) throw new Error('No clips provided')

    let content = ''
    const clipList = clips.map((url: string, i: number) =>
      `Clip ${i + 1} (${i === 0 ? 'the build' : i === clips.length - 1 ? 'the drop' : 'escalation'}): ${url}`
    ).join('\n')

    if (mode === 'song') {
      content = `/video-sync Here are ${clips.length} video clips to edit together:\n${clipList}\n\nFind the song "${songName}" on SoundCloud or YouTube and download the audio. Locate the moment described as "${moment}". Cut between clips at musically appropriate moments, with the final cut landing exactly at "${moment}". Apply VFX at cut points — brightness flash, saturation boost, RGB split glitch, screen shake. Apply slow-mo to the build clip and speed ramp into the drop. Apply consistent color grading across all clips. Export as MP4 and return only the final URL.`
    } else {
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nCut between clips at the most impactful moment around second ${beat?.drop || 2}. Apply VFX at cut points — brightness flash and saturation boost. Review the final edit and make targeted improvements if needed. Return only the final MP4 URL.`
    }

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

    return NextResponse.json({ taskId: taskData.task_id, rawVideoUrl })

  } catch (err: any) {
    return NextResponse.json({ videoUrl: rawVideoUrl, error: err.message }, { status: 500 })
  }
}
