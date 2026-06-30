import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { FFprobeWorker } from 'ffprobe-wasm'

export type VideoMetadata = {
  durationSeconds: number
  fps: number
  frameCount: number
  source?: 'ffprobe' | 'fallback'
}

export type VideoMetadataWithFallback = VideoMetadata & {
  source: 'ffprobe' | 'fallback'
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export function fallbackVideoMetadata(durationSeconds = 8): VideoMetadataWithFallback {
  const fps = 24
  return {
    durationSeconds,
    fps,
    frameCount: Math.round(durationSeconds * fps),
    source: 'fallback',
  }
}

function parseFrameRate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parts = value.split('/')
    if (parts.length === 2) {
      const num = parseFloat(parts[0])
      const den = parseFloat(parts[1])
      if (num > 0 && den > 0) return num / den
    }
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 24
}

function pickVideoStream(streams: unknown[]): Record<string, unknown> | null {
  if (!Array.isArray(streams)) return null
  for (const stream of streams) {
    if (!stream || typeof stream !== 'object') continue
    const s = stream as Record<string, unknown>
    if (s.codec_type === 'video' || (typeof s.width === 'number' && s.width > 0)) return s
  }
  for (const stream of streams) {
    if (stream && typeof stream === 'object') return stream as Record<string, unknown>
  }
  return null
}

function parseFileInfo(fileInfo: Record<string, unknown>): VideoMetadataWithFallback {
  const format = (fileInfo.format ?? {}) as Record<string, unknown>
  const stream = pickVideoStream(fileInfo.streams as unknown[] ?? [])

  const formatDuration = parseFloat(String(format.duration ?? ''))
  const streamDuration = parseFloat(String(stream?.duration ?? ''))

  const durationSeconds = Math.round(
    (Number.isFinite(formatDuration) && formatDuration > 0
      ? formatDuration
      : Number.isFinite(streamDuration) && streamDuration > 0
        ? streamDuration
        : 8) * 10
  ) / 10

  const fps = Math.round(
    parseFrameRate(stream?.avg_frame_rate ?? stream?.r_frame_rate) * 100
  ) / 100

  const nbFrames = parseInt(String(stream?.nb_frames ?? ''), 10)
  const frameCount =
    Number.isFinite(nbFrames) && nbFrames > 0
      ? nbFrames
      : Math.round(durationSeconds * fps)

  return { durationSeconds, fps, frameCount, source: 'ffprobe' }
}

export async function probeVideoUrl(videoUrl: string): Promise<VideoMetadataWithFallback> {
  let tempPath: string | null = null
  let worker: FFprobeWorker | null = null

  try {
    const res = await fetch(videoUrl)
    if (!res.ok) return fallbackVideoMetadata()

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES) {
      return fallbackVideoMetadata()
    }

    tempPath = join(tmpdir(), `clawd-probe-${randomUUID()}.mp4`)
    await writeFile(tempPath, Buffer.from(buffer))

    worker = new FFprobeWorker()
    const fileInfo = (await worker.getFileInfo(tempPath)) as Record<string, unknown>
    return parseFileInfo(fileInfo)
  } catch {
    return fallbackVideoMetadata()
  } finally {
    if (worker) {
      try {
        worker.terminate()
      } catch {
        // ignore cleanup errors
      }
    }
    if (tempPath) {
      try {
        await unlink(tempPath)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
