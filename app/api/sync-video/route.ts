import { NextRequest, NextResponse } from 'next/server'
import { metadataForClipDuration } from '../../../lib/video-metadata'

export const runtime = 'nodejs'
export const maxDuration = 60

const MANUS_BASE = 'https://api.manus.ai'

function clipRole(i: number, total: number): string {
  if (i === 0) return 'the build'
  if (i === total - 1) return 'the drop'
  return 'escalation'
}

function buildClipList(clips: string[], clipDuration = 8): string {
  const meta = metadataForClipDuration(clipDuration)
  return clips
    .map((url, i) => {
      return `Clip ${i + 1} (${clipRole(i, clips.length)}): ${url} — ${meta.durationSeconds}s, ${meta.fps}fps, ${meta.frameCount} frames`
    })
    .join('\n')
}

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const { clips, musicMode, songName, moment, vibeDescription, beat, audioUrl, clipDuration } = body
    rawVideoUrl = clips?.[0]

    if (!clips || clips.length === 0) throw new Error('No clips provided')

    const durationSec = typeof clipDuration === 'number' ? clipDuration : 8
    // #region agent log
    console.log('[sync-video] start', { clipCount: clips.length, clipDuration: durationSec, musicMode })
    fetch('http://127.0.0.1:7360/ingest/e706df41-42db-4fc9-8faf-adc2def9c83f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1de77'},body:JSON.stringify({sessionId:'a1de77',location:'app/api/sync-video/route.ts:POST',message:'sync start',data:{clipCount:clips.length,clipDuration:durationSec,musicMode},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    const clipList = buildClipList(clips, durationSec)
    const durationNote =
      'Clip durations are provided above — loop or trim clips to fit the audio without re-probing duration.'

    let content = ''

    if (musicMode === 'my-song') {
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nFind the song "${songName}" on SoundCloud or YouTube and download the full audio. Locate the moment described as "${moment}". Cut between clips at musically appropriate moments with the final cut landing exactly at that moment. Apply VFX at cut points — brightness flash, saturation boost, RGB split glitch, screen shake. Apply slow-mo to the build clip and speed ramp into the drop. Apply consistent color grading. Export as MP4 and return only the final URL.`
    } else if (musicMode === 'find-song') {
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nAnalyze these clips carefully. Identify the energy arc — the buildup, the release, the key action moments. Use the energy transfer framework: find the potential energy (buildup), kinetic release (impact), and absorption (reaction). The vibe described is: "${vibeDescription || 'match the visual energy of the clips'}". Based on this analysis, find a song on SoundCloud or YouTube that perfectly matches this energy and vibe. Download the full audio. Find the exact moment in the song that best matches the key visual action. Cut between clips at that moment. Apply VFX — brightness flash, RGB split glitch, screen shake. Apply slow-mo to build clip, speed ramp into drop. Export as MP4 and return only the final URL.`
    } else {
      if (!audioUrl) throw new Error('No audio URL provided for AI music mode')
      const dropSec = beat?.drop ?? beat?.dropSeconds ?? 2
      content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\nAudio track URL: ${audioUrl}\n\n${durationNote} Cut between clips at the most impactful moment around second ${dropSec}. Apply subtle VFX at the cut — brightness flash and saturation boost. Apply consistent color grading. Export as MP4 and return only the final URL.`
    }

    // #region agent log
    console.log('[sync-video] calling Manus task.create')
    // #endregion

    const taskRes = await fetch(MANUS_BASE + '/v2/task.create', {
      method: 'POST',
      headers: {
        'x-manus-api-key': process.env.MANUS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { content } }),
    })

    const taskText = await taskRes.text()
    let taskData: { ok?: boolean; task_id?: string; error?: string }
    try {
      taskData = JSON.parse(taskText)
    } catch {
      throw new Error(`Manus returned non-JSON (${taskRes.status}): ${taskText.slice(0, 200)}`)
    }

    // #region agent log
    console.log('[sync-video] manus response', { ok: taskData.ok, status: taskRes.status, hasTaskId: !!taskData.task_id })
    fetch('http://127.0.0.1:7360/ingest/e706df41-42db-4fc9-8faf-adc2def9c83f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1de77'},body:JSON.stringify({sessionId:'a1de77',location:'app/api/sync-video/route.ts:POST',message:'manus response',data:{ok:taskData.ok,status:taskRes.status,hasTaskId:!!taskData.task_id},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))

    return NextResponse.json({ taskId: taskData.task_id, rawVideoUrl })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    // #region agent log
    console.error('[sync-video] error', message)
    // #endregion
    return NextResponse.json({ videoUrl: rawVideoUrl, error: message }, { status: 500 })
  }
}
