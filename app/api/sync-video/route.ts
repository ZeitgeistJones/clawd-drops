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

function buildClipList(clips: string[], clipDurations: number[]): string {
  return clips
    .map((url, i) => {
      const dur = clipDurations[i] ?? clipDurations[clipDurations.length - 1] ?? 8
      const meta = metadataForClipDuration(dur)
      return `Clip ${i + 1} (${clipRole(i, clips.length)}): ${url} — ${meta.durationSeconds}s, ${meta.fps}fps, ${meta.frameCount} frames`
    })
    .join('\n')
}

function buildFrameList(frames: string[]): string {
  return frames.map((url, i) => `Frame ${i + 1}: ${url}`).join('\n')
}

function audioBlock(audioUrl: string, beat: { drop?: number; dropSeconds?: number; peak?: number; peakSeconds?: number }) {
  const dropSec = beat?.drop ?? beat?.dropSeconds ?? 2
  const peakSec = beat?.peak ?? beat?.peakSeconds ?? dropSec + 0.3
  return `Audio track URL: ${audioUrl}
Drop at second ${dropSec}. Peak at second ${peakSec}.
Download this audio URL directly. Do not search for or download music from YouTube, SoundCloud, or any other source.`
}

export async function POST(req: NextRequest) {
  let rawVideoUrl = null
  try {
    const body = await req.json()
    const {
      clips = [],
      frames = [],
      mode = 'video',
      musicMode,
      beat,
      audioUrl,
      clipDurations,
    } = body

    rawVideoUrl = clips?.[0] ?? frames?.[0] ?? null

    if (!audioUrl || typeof audioUrl !== 'string') {
      return NextResponse.json({ error: 'No audio URL provided' }, { status: 400 })
    }

    const durations: number[] = Array.isArray(clipDurations) && clipDurations.length
      ? clipDurations
      : clips.map(() => 8)

    const audioSection = audioBlock(audioUrl, beat ?? {})
    const dropSec = beat?.drop ?? beat?.dropSeconds ?? 2

    let content = ''

    if (mode === 'flipbook') {
      if (!frames.length) throw new Error('No flipbook frames provided')
      const frameList = buildFrameList(frames)
      content = `/video-sync Here are ${frames.length} sequential character images showing an emotional arc:\n${frameList}\n\n${audioSection}\n\nStitch these into a fast flipbook-style video — quick cuts between frames, building tension, with the final frame landing on the music drop around second ${dropSec}. Apply subtle VFX at the drop — brightness flash and saturation boost. Apply consistent color grading. Export as MP4 and return only the final URL.`
    } else {
      if (!clips.length) throw new Error('No clips provided')
      const clipList = buildClipList(clips, durations)
      const durationNote =
        'Clip durations are provided above — loop or trim clips to fit the audio without re-probing duration.'

      if (musicMode === 'find-song') {
        content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\n${audioSection}\n\nThis is a CC0 track pre-selected by the app. Use only the provided audio URL.\n${durationNote} Cut between clips at the drop around second ${dropSec}. Apply VFX at cut points — brightness flash, saturation boost, RGB split glitch, screen shake. Apply slow-mo to the build clip and speed ramp into the drop. Apply consistent color grading. Export as MP4 and return only the final URL.`
      } else {
        content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\n${audioSection}\n\n${durationNote} Cut between clips at the most impactful moment around second ${dropSec}. Apply subtle VFX at the cut — brightness flash and saturation boost. Apply consistent color grading. Export as MP4 and return only the final URL.`
      }
    }

    const taskRes = await fetch(MANUS_BASE + '/v2/task.create', {
      method: 'POST',
      headers: {
        'x-manus-api-key': process.env.MANUS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { content } }),
    })

    const taskText = await taskRes.text()
    let taskData: { ok?: boolean; task_id?: string }
    try {
      taskData = JSON.parse(taskText)
    } catch {
      throw new Error(`Manus returned non-JSON (${taskRes.status}): ${taskText.slice(0, 200)}`)
    }

    if (!taskData.ok) throw new Error('Manus task creation failed: ' + JSON.stringify(taskData))

    return NextResponse.json({ taskId: taskData.task_id, rawVideoUrl })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ videoUrl: rawVideoUrl, error: message }, { status: 500 })
  }
}
