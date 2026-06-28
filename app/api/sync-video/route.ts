import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const { videoUrl1, videoUrl2, mode, songName, moment, beat } = body
    rawVideoUrl = videoUrl1

    let content = ''

    if (mode === 'song') {
      content = '/video-sync Here are two video clips to edit together: Clip 1 (the build): ' + videoUrl1 + ' Clip 2 (the drop): ' + videoUrl2 + '. Find the song "' + songName + '" on SoundCloud or YouTube and download the audio. Locate the moment described as "' + moment + '". Cut from clip 1 to clip 2 exactly at that moment. Apply VFX at the cut — brightness flash, saturation boost, RGB split glitch. Apply slow-mo to clip 1 and speed ramp into clip 2. Apply consistent color grading across both clips. Export as MP4 and return only the final URL.'
    } else {
      content = '/video-sync Here are two video clips: Clip 1 (the build): ' + videoUrl1 + ' Clip 2 (the drop): ' + videoUrl2 + '. Cut from clip 1 to clip 2 at the most impactful moment around second ' + (beat?.drop || 2) + '. Apply VFX at the cut — brightness flash and saturation boost. Review the final edit and make targeted improvements if needed. Return only the final MP4 URL.'
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
