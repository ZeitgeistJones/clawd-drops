import { NextRequest, NextResponse } from 'next/server'
import { searchLibraryMusic } from '../../../lib/library-music'

export const runtime = 'nodejs'
export const maxDuration = 120

const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1'
const PRODUCER_CREDIT_COST = 12
const POLL_INTERVAL_MS = 8000
const MAX_POLL_ATTEMPTS = 14

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.MUSICAPI_KEY}`,
    'Content-Type': 'application/json',
  }
}

function clampDuration(seconds?: number): number {
  const n = typeof seconds === 'number' ? seconds : 18
  return Math.min(20, Math.max(15, Math.round(n)))
}

async function getMusicApiCredits(): Promise<number> {
  const res = await fetch(`${MUSICAPI_BASE}/get-credits`, {
    headers: { Authorization: `Bearer ${process.env.MUSICAPI_KEY}` },
  })
  if (!res.ok) throw new Error(`Credit check failed: ${res.status}`)

  const data = await res.json()
  const subscription = data.data?.credits ?? data.credits ?? 0
  const extra = data.data?.extra_credits ?? data.extra_credits ?? 0
  return Number(subscription) + Number(extra)
}

async function createProducerTask(prompt: string, length: number): Promise<string> {
  await new Promise(r => setTimeout(r, 3000))

  const sound = `instrumental, no vocals, ${prompt}`.trim()
  const res = await fetch(`${MUSICAPI_BASE}/producer/create`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      task_type: 'create_music',
      sound,
      lyrics: '',
      title: 'Clawd Drop',
      length,
    }),
  })

  const data = await res.json()
  if (res.status === 403) throw new Error('insufficient_credits')
  if (!res.ok) throw new Error(data.error || data.message || `Create failed: ${res.status}`)

  const taskId = data.task_id || data.data?.task_id
  if (!taskId) throw new Error('No task_id from MusicAPI: ' + JSON.stringify(data))
  return taskId
}

async function pollProducerTask(taskId: string): Promise<{ audioUrl: string; title?: string }> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(`${MUSICAPI_BASE}/producer/task/${taskId}`, {
      headers: { Authorization: `Bearer ${process.env.MUSICAPI_KEY}` },
    })
    const data = await res.json()

    if (res.status === 202 || data.type === 'not_ready') continue

    const clip = Array.isArray(data.data) ? data.data[0] : null
    const state = clip?.state

    if (state === 'failed') {
      throw new Error('MusicAPI task failed')
    }

    if (state === 'succeeded') {
      const audioUrl = clip?.audio_url || clip?.wav_url
      if (!audioUrl) throw new Error('MusicAPI succeeded but no audio_url in response')
      return { audioUrl, title: clip?.title }
    }
  }

  throw new Error('MusicAPI task timed out')
}

async function tryMusicApi(prompt: string, durationSeconds: number) {
  if (!process.env.MUSICAPI_KEY) throw new Error('MUSICAPI_KEY not configured')

  const credits = await getMusicApiCredits()
  if (credits < PRODUCER_CREDIT_COST) throw new Error('insufficient_credits')

  const taskId = await createProducerTask(prompt, durationSeconds)
  const { audioUrl, title } = await pollProducerTask(taskId)

  return { taskId, audioUrl, title }
}

export async function POST(req: NextRequest) {
  const { prompt, durationSeconds: rawDuration } = await req.json()
  const durationSeconds = clampDuration(rawDuration)
  const mood = typeof prompt === 'string' ? prompt : 'cinematic instrumental'

  try {
    const music = await tryMusicApi(mood, durationSeconds)
    return NextResponse.json({
      success: true,
      provider: 'musicapi',
      taskId: music.taskId,
      audioUrl: music.audioUrl,
      durationSeconds,
      title: music.title,
    })
  } catch {
    const library = await searchLibraryMusic(mood)
    return NextResponse.json({
      success: true,
      provider: library.source,
      audioUrl: library.audioUrl,
      durationSeconds,
      title: library.title,
      creator: library.creator,
    })
  }
}
