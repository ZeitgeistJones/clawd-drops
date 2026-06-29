import { NextRequest, NextResponse } from 'next/server'

const MANUS_BASE = 'https://api.manus.ai'

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const { clips, musicMode, songName, moment, vibeDescription, beat } = body
    rawVideoUrl = clips?.[0]

    if (!clips || clips.length === 0) throw new Error('No clips provided')

    const clipList = clips.map((url: string, i: number) =>
      `Clip ${i + 1} (${i === 0 ? 'the build' : i === clips.length - 1 ? 'the drop' : 'escalation'}): ${url}`
    ).join('\n')

    let content = ''

    if (musicMode === 'my-song') {
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nFind the song "${songName}" on SoundCloud or YouTube and download the full audio. Locate the moment described as "${moment}". Cut between clips at musically appropriate moments with the final cut landing exactly at that moment. Apply VFX at cut points — brightness flash, saturation boost, RGB split glitch, screen shake. Apply slow-mo to the build clip and speed ramp into the drop. Apply consistent color grading. Export as MP4 and return only the final URL.`
    } else if (musicMode === 'find-song') {
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nAnalyze these clips carefully. Identify the energy arc — the buildup, the release, the key action moments. Use the energy transfer framework: find the potential energy (buildup), kinetic release (impact), and absorption (reaction). The vibe described is: "${vibeDescription || 'match the visual energy of the clips'}". Based on this analysis, find a song on SoundCloud or YouTube that perfectly matches this energy and vibe. Download the full audio. Find the exact moment in the song that best matches the key visual action. Cut between clips at that moment. Apply VFX — brightness flash, RGB split glitch, screen shake. Apply slow-mo to build clip, speed ramp into drop. Export as MP4 and return only the final URL.`
    } else {
      // AUTO mode — Manus just reviews and polishes
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nReview these clips and cut them together at the most impactful moment around second ${beat?.drop || 2}. Apply subtle VFX at the cut — brightness flash and saturation boost. Apply consistent color grading. Return only the final MP4 URL.`
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
