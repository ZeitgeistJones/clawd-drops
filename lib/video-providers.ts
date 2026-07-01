export type VideoProvider =
  | 'seedance'
  | 'wavespeed'
  | 'magichour'
  | 'hypereal'
  | 'deapi'
  | 'replicate'

export const VIDEO_PROVIDER_CHAIN: VideoProvider[] = [
  'seedance',
  'wavespeed',
  'magichour',
  'hypereal',
  'deapi',
  'replicate',
]

export const PROVIDER_LABELS: Record<VideoProvider, string> = {
  seedance: 'Seedance',
  wavespeed: 'WaveSpeed',
  magichour: 'Magic Hour',
  hypereal: 'Hypereal',
  deapi: 'deAPI',
  replicate: 'Replicate',
}

const SEEDANCE_GENERATIONS_URL = 'https://api.seedance2.ai/v1/videos/generations'
const SEEDANCE_TASKS_URL = 'https://api.seedance2.ai/v1/tasks'
const WAVESPEED_SUBMIT_URL = 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/image-to-video'
const WAVESPEED_RESULT_URL = 'https://api.wavespeed.ai/api/v3/predictions'
const MAGIC_HOUR_SUBMIT_URL = 'https://api.magichour.ai/v1/image-to-video'
const MAGIC_HOUR_PROJECT_URL = 'https://api.magichour.ai/v1/video-projects'
const HYPEREAL_SUBMIT_URL = 'https://api.hypereal.ai/v1/generate/video'
const HYPEREAL_JOBS_URL = 'https://api.hypereal.ai/v1/jobs'
const DEAPI_ANIMATIONS_URL = 'https://api.deapi.ai/api/v2/videos/animations'
const DEAPI_JOBS_URL = 'https://api.deapi.ai/api/v2/jobs'
const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/models/wan-video/wan-2.2-i2v-fast/predictions'
const MAGIC_HOUR_UPLOAD_URL = 'https://api.magichour.ai/v1/files/upload-urls'

const PROVIDER_ENV_KEYS: Record<VideoProvider, string> = {
  seedance: 'SEEDANCE_API_KEY',
  wavespeed: 'WAVESPEED_API_KEY',
  magichour: 'MAGIC_HOUR_KEY',
  hypereal: 'HYPEREAL_API_KEY',
  deapi: 'DEAPI_KEY',
  replicate: 'REPLICATE_API_KEY',
}

type ClipOpts = {
  prompt: string
  imageUrl: string
  model: string
  duration: number
  returnLastFrame: boolean
}

type SubmitResult = { taskId: string } | { error: string; insufficientCredits?: boolean }

export function isVideoProvider(value: string): value is VideoProvider {
  return VIDEO_PROVIDER_CHAIN.includes(value as VideoProvider)
}

export function isInsufficientCredits(data: unknown, httpStatus?: number): boolean {
  if (httpStatus && httpStatus >= 400) {
    const text = JSON.stringify(data).toLowerCase()
    if (text.includes('insufficient_credits') || text.includes('insufficient credits')) return true
  }
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const candidates = [
    d.error,
    d.code,
    d.message,
    (d.error as Record<string, unknown>)?.code,
    (d.error as Record<string, unknown>)?.message,
  ]
  const text = candidates.filter(Boolean).join(' ').toLowerCase()
  return text.includes('insufficient_credits') || text.includes('insufficient credits')
}

function wavespeedDuration(duration: number): 5 | 8 {
  return duration <= 5 ? 5 : 8
}

function magicHourDuration(duration: number): number {
  return duration <= 5 ? 5 : 8
}

function deapiFrames(duration: number): number {
  return duration <= 5 ? 121 : 193
}

export function effectiveDuration(requested: number, provider: VideoProvider): number {
  if (provider === 'seedance') return requested
  if (provider === 'deapi') return requested <= 5 ? 5 : 8
  return requested <= 5 ? 5 : 8
}

export function isBackupVideoProvider(provider: string): boolean {
  return provider !== 'seedance'
}

function getProviderApiKey(provider: VideoProvider): string | undefined {
  const value = process.env[PROVIDER_ENV_KEYS[provider]]
  return value?.trim() || undefined
}

function authHeader(key: string | undefined, prefix = 'Bearer'): Record<string, string> {
  if (!key) return {}
  return { Authorization: `${prefix} ${key}` }
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 500) }
  }
}

function imageExtensionFromContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'jpg'
}

async function uploadMagicHourImage(imageUrl: string): Promise<string | null> {
  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) return null

  const buffer = await imageRes.arrayBuffer()
  const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
  const extension = imageExtensionFromContentType(contentType)

  const uploadRes = await fetch(MAGIC_HOUR_UPLOAD_URL, {
    method: 'POST',
    headers: {
      ...authHeader(getProviderApiKey('magichour')),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ type: 'image', extension }],
    }),
  })
  const uploadData = (await parseJsonResponse(uploadRes)) as {
    items?: { upload_url?: string; file_path?: string }[]
  }
  const item = uploadData.items?.[0]
  if (!item?.upload_url || !item?.file_path) return null

  const putRes = await fetch(item.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  })
  if (!putRes.ok) return null

  return item.file_path
}

export async function submitSeedanceClip(opts: ClipOpts): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('seedance')
  if (!apiKey) return { error: 'SEEDANCE_API_KEY not configured' }

  const res = await fetch(SEEDANCE_GENERATIONS_URL, {
    method: 'POST',
    headers: {
      ...authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      input: {
        prompt: opts.prompt,
        generation_type: 'image-to-video',
        image_urls: [opts.imageUrl],
        duration: opts.duration,
        resolution: '480p',
        watermark: false,
        generate_audio: false,
        return_last_frame: opts.returnLastFrame,
      },
    }),
  })
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const taskId = (data.taskId || data.id) as string | undefined
  if (taskId) return { taskId }

  return {
    error: JSON.stringify(data),
    insufficientCredits: isInsufficientCredits(data, res.status),
  }
}

export async function submitWaveSpeedClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('wavespeed')
  if (!apiKey) return { error: 'WAVESPEED_API_KEY not configured' }

  const res = await fetch(WAVESPEED_SUBMIT_URL, {
    method: 'POST',
    headers: {
      ...authHeader(apiKey),
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
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const nested = data.data as Record<string, unknown> | undefined
  const taskId = (nested?.id || data.id) as string | undefined
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function submitMagicHourClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('magichour')
  if (!apiKey) return { error: 'MAGIC_HOUR_KEY not configured' }

  const imageFilePath = await uploadMagicHourImage(opts.imageUrl)
  if (!imageFilePath) {
    return { error: 'Failed to upload image to Magic Hour storage' }
  }

  const res = await fetch(MAGIC_HOUR_SUBMIT_URL, {
    method: 'POST',
    headers: {
      ...authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Clawd Drops clip',
      end_seconds: magicHourDuration(opts.duration),
      model: 'seedance-2.0',
      resolution: '480p',
      audio: false,
      style: { prompt: opts.prompt },
      assets: {
        image_file_path: imageFilePath,
      },
    }),
  })
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const taskId = data.id as string | undefined
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function submitHyperealClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('hypereal')
  if (!apiKey) return { error: 'HYPEREAL_API_KEY not configured' }

  const res = await fetch(HYPEREAL_SUBMIT_URL, {
    method: 'POST',
    headers: {
      ...authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.imageUrl,
      image_urls: [opts.imageUrl],
      duration: magicHourDuration(opts.duration),
    }),
  })
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const nested = data.data as Record<string, unknown> | undefined
  const taskId = (data.jobId || data.id || nested?.id) as string | undefined
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function submitDeapiClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('deapi')
  if (!apiKey) return { error: 'DEAPI_KEY not configured' }

  const imageRes = await fetch(opts.imageUrl)
  if (!imageRes.ok) return { error: `Failed to fetch image for deAPI: ${imageRes.status}` }

  const imageBuffer = await imageRes.arrayBuffer()
  const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
  const form = new FormData()
  form.append('prompt', opts.prompt)
  form.append('first_frame_image', new Blob([imageBuffer], { type: contentType }), 'frame.jpg')
  form.append('model', 'Ltx2_19B_Dist_FP8')
  form.append('width', '832')
  form.append('height', '480')
  form.append('guidance', '1')
  form.append('steps', '8')
  form.append('seed', String(Math.floor(Math.random() * 1_000_000)))
  form.append('frames', String(deapiFrames(opts.duration)))

  const res = await fetch(DEAPI_ANIMATIONS_URL, {
    method: 'POST',
    headers: authHeader(apiKey),
    body: form,
  })
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const nested = data.data as Record<string, unknown> | undefined
  const taskId = (nested?.request_id || data.request_id) as string | undefined
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function submitReplicateClip(opts: {
  prompt: string
  imageUrl: string
  duration: number
}): Promise<SubmitResult> {
  const apiKey = getProviderApiKey('replicate')
  if (!apiKey) return { error: 'REPLICATE_API_KEY not configured' }

  const res = await fetch(REPLICATE_PREDICTIONS_URL, {
    method: 'POST',
    headers: {
      ...authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        image: opts.imageUrl,
        prompt: opts.prompt,
        duration: magicHourDuration(opts.duration),
      },
    }),
  })
  const data = (await parseJsonResponse(res)) as Record<string, unknown>
  const taskId = data.id as string | undefined
  if (taskId) return { taskId }

  return { error: JSON.stringify(data) }
}

export async function pollSeedanceTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
  lastFrameUrl?: string
}> {
  const res = await fetch(`${SEEDANCE_TASKS_URL}/${taskId}`, {
    headers: authHeader(getProviderApiKey('seedance')),
  })
  const data = await res.json()
  const rawStatus = data.status || data.data?.status || 'processing'
  const videoUrl = data.data?.results?.[0] || data.results?.[0]
  const lastFrameUrl =
    typeof data.data?.last_frame_url === 'string' ? data.data.last_frame_url : undefined

  if (rawStatus === 'failed') return { status: 'failed' }
  if (rawStatus === 'completed' && videoUrl) return { status: 'completed', videoUrl, lastFrameUrl }
  return { status: 'processing', lastFrameUrl }
}

export async function pollWaveSpeedTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`${WAVESPEED_RESULT_URL}/${taskId}/result`, {
    headers: authHeader(getProviderApiKey('wavespeed')),
  })
  const data = await res.json()
  const rawStatus = data.data?.status || data.status || 'processing'
  const outputs = data.data?.outputs || data.outputs
  const videoUrl = Array.isArray(outputs) ? outputs[0] : undefined

  if (rawStatus === 'failed') return { status: 'failed' }
  if (rawStatus === 'completed' && videoUrl) return { status: 'completed', videoUrl }
  return { status: 'processing' }
}

export async function pollMagicHourTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`${MAGIC_HOUR_PROJECT_URL}/${taskId}`, {
    headers: authHeader(getProviderApiKey('magichour')),
  })
  const data = await res.json()
  const rawStatus = data.status || 'processing'
  const downloads = data.downloads
  const videoUrl = Array.isArray(downloads) ? downloads[0]?.url : undefined

  if (rawStatus === 'error' || rawStatus === 'failed') return { status: 'failed' }
  if (rawStatus === 'complete' && videoUrl) return { status: 'completed', videoUrl }
  return { status: 'processing' }
}

export async function pollHyperealTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`${HYPEREAL_JOBS_URL}/${taskId}`, {
    headers: authHeader(getProviderApiKey('hypereal')),
  })
  const data = await res.json()
  const rawStatus = data.status || 'processing'
  const videoUrl =
    (typeof data.output?.url === 'string' ? data.output.url : undefined) ||
    (typeof data.output === 'string' ? data.output : undefined) ||
    (typeof data.video_url === 'string' ? data.video_url : undefined)

  if (rawStatus === 'failed') return { status: 'failed' }
  if (rawStatus === 'completed' && videoUrl) return { status: 'completed', videoUrl }
  return { status: 'processing' }
}

export async function pollDeapiTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`${DEAPI_JOBS_URL}/${taskId}`, {
    headers: authHeader(getProviderApiKey('deapi')),
  })
  const data = await res.json()
  const job = data.data || data
  const rawStatus = job.status || 'processing'
  const videoUrl = typeof job.result_url === 'string' ? job.result_url : undefined

  if (rawStatus === 'error' || rawStatus === 'failed') return { status: 'failed' }
  if (rawStatus === 'done' && videoUrl) return { status: 'completed', videoUrl }
  return { status: 'processing' }
}

export async function pollReplicateTask(taskId: string): Promise<{
  status: string
  videoUrl?: string
}> {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${taskId}`, {
    headers: authHeader(getProviderApiKey('replicate')),
  })
  const data = await res.json()
  const rawStatus = data.status || 'processing'
  const output = data.output
  const videoUrl =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output[0]
        : undefined

  if (rawStatus === 'failed' || rawStatus === 'canceled') return { status: 'failed' }
  if (rawStatus === 'succeeded' && videoUrl) return { status: 'completed', videoUrl }
  return { status: 'processing' }
}

export async function pollVideoTask(
  provider: VideoProvider,
  taskId: string
): Promise<{
  status: string
  videoUrl?: string
  lastFrameUrl?: string
}> {
  switch (provider) {
    case 'wavespeed':
      return pollWaveSpeedTask(taskId)
    case 'magichour':
      return pollMagicHourTask(taskId)
    case 'hypereal':
      return pollHyperealTask(taskId)
    case 'deapi':
      return pollDeapiTask(taskId)
    case 'replicate':
      return pollReplicateTask(taskId)
    default:
      return pollSeedanceTask(taskId)
  }
}

export async function submitVideoClip(
  provider: VideoProvider,
  opts: ClipOpts
): Promise<SubmitResult> {
  switch (provider) {
    case 'wavespeed':
      return submitWaveSpeedClip(opts)
    case 'magichour':
      return submitMagicHourClip(opts)
    case 'hypereal':
      return submitHyperealClip(opts)
    case 'deapi':
      return submitDeapiClip(opts)
    case 'replicate':
      return submitReplicateClip(opts)
    default:
      return submitSeedanceClip(opts)
  }
}

export async function submitVideoClipWithFallback(
  opts: ClipOpts,
  forceProvider?: VideoProvider
): Promise<{ taskId: string; provider: VideoProvider } | { error: string; providerErrors: string[] }> {
  const providers = forceProvider ? [forceProvider] : VIDEO_PROVIDER_CHAIN
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await submitVideoClip(provider, opts)
      if ('taskId' in result) {
        return { taskId: result.taskId, provider }
      }
      errors.push(`${PROVIDER_LABELS[provider]}: ${result.error}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${PROVIDER_LABELS[provider]}: ${message}`)
    }
  }

  return { error: errors.join('; '), providerErrors: errors }
}
