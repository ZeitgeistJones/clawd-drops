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

function totalClipSeconds(durations: number[]): number {
  return durations.reduce((sum, d) => sum + d, 0)
}

function buildManusEffectPolicy(totalSeconds: number): string {
  return [
    '',
    '--- TIME BUDGET (strict) ---',
    'This is a BRIEF edit job. You have a strict time budget — finish fast and export.',
    'Priority order: (1) required deliverables below, (2) optional effects ONLY if time clearly remains.',
    'If time is tight, ship the required edit with zero optional effects. Do not run multiple render passes.',
    'You decide how much optional polish fits in the time you have — fewer effects is better than missing the deadline.',
    '',
    'REQUIRED (never skip): download clips + audio, trim audio to exact length, concat clips, hard cut at drop, export MP4.',
    '',
    'OPTIONAL (apply only what you can finish quickly, highest impact first):',
    '  • Fast (~seconds): brightness flash + saturation bump at the drop cut',
    '  • Medium (~minute): light screen shake on the drop clip',
    '  • Skip if rushed: slow-mo, speed ramps, RGB split, heavy color grading, extra transitions',
    `Target: a ${totalSeconds}s hype edit — punchy cut on the drop matters more than fancy VFX.`,
  ].join('\n')
}

function buildManusFinalInstructions(opts: {
  totalSeconds: number
  dropSec: number
  clipCount: number
  mode: 'video' | 'flipbook'
  musicMode?: string
}): string {
  const { totalSeconds, dropSec, clipCount, mode, musicMode } = opts
  const lines = [
    '',
    '--- OUTPUT REQUIREMENTS (follow exactly) ---',
    `Final exported MP4 must be exactly ${totalSeconds} seconds long — no longer, no shorter.`,
    `Trim the audio to ${totalSeconds}s. Do not use the full song if it is longer than ${totalSeconds}s.`,
    mode === 'flipbook'
      ? `Land the music drop around second ${dropSec} within the ${totalSeconds}s timeline.`
      : clipCount >= 2
        ? `Cut from the build clip(s) to the drop clip at the music drop around second ${dropSec} (within the ${totalSeconds}s export).`
        : `Sync the single clip to the drop around second ${dropSec} (within the ${totalSeconds}s export).`,
    'Loop or speed-ramp source clips only as needed to fill the timeline — do not pad with black frames.',
    musicMode === 'find-song'
      ? 'Use only the provided CC0 audio URL; trim it to fit the export length.'
      : 'Trim provided audio to fit the export length.',
    'Export as MP4 and return only the final video URL.',
    buildManusEffectPolicy(totalSeconds),
  ]
  return lines.join('\n')
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
    const totalSeconds = totalClipSeconds(durations)
    const finalInstructions = buildManusFinalInstructions({
      totalSeconds,
      dropSec,
      clipCount: clips.length,
      mode: mode === 'flipbook' ? 'flipbook' : 'video',
      musicMode,
    })

    let content = ''

    if (mode === 'flipbook') {
      if (!frames.length) throw new Error('No flipbook frames provided')
      const frameList = buildFrameList(frames)
      content = `/video-sync Here are ${frames.length} sequential character images showing an emotional arc:\n${frameList}\n\n${audioSection}\n\nStitch into a flipbook video — quick cuts, land on the drop around second ${dropSec}. Required: fast stitch + export. Optional if time allows: brief flash at drop.${finalInstructions}`
    } else {
      if (!clips.length) throw new Error('No clips provided')
      const clipList = buildClipList(clips, durations)
      const durationNote =
        'Clip durations are provided above — loop or trim clips to fit the audio without re-probing duration.'

      if (musicMode === 'find-song') {
        content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\n${audioSection}\n\nThis is a CC0 track pre-selected by the app. Use only the provided audio URL.\n${durationNote} Hard-cut from build to drop at second ${dropSec}. Required: trim audio, concat, export. Optional effects only if your time budget allows — see TIME BUDGET below.${finalInstructions}`
      } else {
        content = `/video-sync Here are ${clips.length} video clips:\n${clipList}\n\n${audioSection}\n\n${durationNote} Hard-cut at second ${dropSec}. Required: trim audio, concat, export. Optional effects only if your time budget allows — see TIME BUDGET below.${finalInstructions}`
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
