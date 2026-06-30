export type VideoProvider = 'seedance' | 'wavespeed'

const SEEDANCE_GENERATIONS_URL = 'https://api.seedance2.ai/v1/videos/generations'
const SEEDANCE_TASKS_URL = 'https://api.seedance2.ai/v1/tasks'
const WAVESPEED_SUBMIT_URL = 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/image-to-video'
const WAVESPEED_RESULT_URL = 'https://api.wavespeed.ai/api/v3/predictions'

export function isInsufficientCredits(data: unknown, httpStatus?: number): boolean {
  if (httpStatus && httpStatus >= 400) {
    const text = JSON.stringify(data).toLowerCase()
    if (text.includes('insufficient_credits') || text.includes('insufficient credits')) return true
  }
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const candidates = [d.error, d.code, d.message, (d.error as Record<string, unknown>)?.code, (d.error as Record<string, unknown>)?.message]
  const text = candidates.filter(Boolean).join(' ').toLowerCase()
  return text.includes('insufficient_credits') || text.includes('insufficient credits')
}

function wavespeedDuration(duration: number): 5 | 8 {
  return duration <= 5 ? 5 : 8
}

export async function submitSeedanceClip(opts: {
  prompt: string
  imageUrl: string
  model: string
  duration: number
  returnLastFrame: boolean
}): Promise<{ taskId: string } | { error: string; insufficientCredits: boolean }> {
  const res = await fetch(SEEDANCE_GENERATIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      input: {
        prompt: opts.prompt,
        generation_type: 'reference-to-video',
        image_urls: [opts.imageUrl],
        duration: opts.duration,
        resolution: '480p',
        watermark: false,
        generate_audio: true,
        return_last_frame: opts.returnLastFrame,
      },
    }),
  })
  const data = await res.json()
  const taskId = data.taskId || data.id
  if (taskId) return { taskId }

  const insufficientCredits = isInsufficientCredits(data, res.status)
  return {
    error: JSON.stringify(data),
    insufficientCredits,
  }
}

export async function submitWaveSpeedClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<{ taskId: string } | { error: string }> {
  const res = await fetch(WAVESPEED_SUBMIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image: opts.imageUrl,
      resolution: '480p',
      duration: wavespeedDuration(opts.duration),
      seed: -1,
    }),
  })
  const data = await res.json()
  const taskId = data.data?.id || data.id
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function pollSeedanceTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
  lastFrameUrl?: string
}> {
  const res = await fetch(`${SEEDANCE_TASKS_URL}/${taskId}`, {
    headers: { Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}` },
  })
  const data = await res.json()
  const status = data.status || data.data?.status || 'processing'
  const videoUrl = data.data?.results?.[0] || data.results?.[0]
  const lastFrameUrl =
    typeof data.data?.last_frame_url === 'string' ? data.data.last_frame_url : undefined
  return { status, videoUrl, lastFrameUrl }
}

export async function pollWaveSpeedTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`${WAVESPEED_RESULT_URL}/${taskId}/result`, {
    headers: { Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}` },
  })
  const data = await res.json()
  const status = data.data?.status || data.status || 'processing'
  const outputs = data.data?.outputs || data.outputs
  const videoUrl = Array.isArray(outputs) ? outputs[0] : undefined
  return { status, videoUrl }
}

export async function pollVideoTask(provider: VideoProvider, taskId: string): Promise<{
  status: string
  videoUrl?: string
  lastFrameUrl?: string
}> {
  if (provider === 'wavespeed') return pollWaveSpeedTask(taskId)
  return pollSeedanceTask(taskId)
}

export async function submitVideoClip(
  provider: VideoProvider,
  opts: {
    prompt: string
    imageUrl: string
    model: string
    duration: number
    returnLastFrame: boolean
  }
) {
  if (provider === 'wavespeed') {
    return submitWaveSpeedClip({ prompt: opts.prompt, imageUrl: opts.imageUrl, duration: opts.duration })
  }
  return submitSeedanceClip(opts)
}
