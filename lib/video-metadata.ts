export type VideoMetadata = {
  durationSeconds: number
  fps: number
  frameCount: number
  source?: 'mp4parse' | 'fallback'
}

export type VideoMetadataWithFallback = VideoMetadata & {
  source: 'mp4parse' | 'fallback'
}

const PROBE_CHUNK_BYTES = 256 * 1024
const PROBE_TIMEOUT_MS = 8000

export function fallbackVideoMetadata(durationSeconds = 8): VideoMetadataWithFallback {
  const fps = 24
  return {
    durationSeconds,
    fps,
    frameCount: Math.round(durationSeconds * fps),
    source: 'fallback',
  }
}

function readUInt32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset)
}

function readBoxType(buf: Buffer, offset: number): string {
  return buf.toString('ascii', offset + 4, offset + 8)
}

function getBoxSize(buf: Buffer, offset: number): number {
  if (offset + 8 > buf.length) return 0
  const size = readUInt32BE(buf, offset)
  if (size === 1 && offset + 16 <= buf.length) {
    return Number(buf.readBigUInt64BE(offset + 8))
  }
  return size
}

function findBoxRecursive(
  buf: Buffer,
  type: string,
  start: number,
  end: number
): number | null {
  let offset = start
  while (offset + 8 <= end) {
    const size = getBoxSize(buf, offset)
    if (size < 8 || offset + size > end) break
    const boxType = readBoxType(buf, offset)
    if (boxType === type) return offset
    const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'])
    if (containers.has(boxType)) {
      const found = findBoxRecursive(buf, type, offset + 8, offset + size)
      if (found !== null) return found
    }
    offset += size
  }
  return null
}

function parseMvhd(buf: Buffer, offset: number): { duration: number; timescale: number } | null {
  const body = offset + 8
  if (body >= buf.length) return null
  const version = buf[body]
  if (version === 0 && body + 20 <= buf.length) {
    const timescale = readUInt32BE(buf, body + 12)
    const duration = readUInt32BE(buf, body + 16)
    if (timescale > 0 && duration > 0) return { timescale, duration }
  }
  if (version === 1 && body + 32 <= buf.length) {
    const timescale = readUInt32BE(buf, body + 20)
    const duration = Number(buf.readBigUInt64BE(body + 24))
    if (timescale > 0 && duration > 0) return { timescale, duration }
  }
  return null
}

function parseMp4Metadata(buf: Buffer, defaultDuration = 8): VideoMetadataWithFallback {
  const mvhdOffset = findBoxRecursive(buf, 'mvhd', 0, buf.length)
  if (mvhdOffset === null) return fallbackVideoMetadata(defaultDuration)

  const mvhd = parseMvhd(buf, mvhdOffset)
  if (!mvhd) return fallbackVideoMetadata(defaultDuration)

  const durationSeconds = Math.round((mvhd.duration / mvhd.timescale) * 10) / 10
  const fps = 24
  return {
    durationSeconds,
    fps,
    frameCount: Math.round(durationSeconds * fps),
    source: 'mp4parse',
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchByteRange(url: string, start: number, end: number): Promise<Buffer | null> {
  const res = await fetchWithTimeout(url, {
    headers: { Range: `bytes=${start}-${end}` },
  })
  if (!res || (res.status !== 206 && !res.ok)) return null
  return Buffer.from(await res.arrayBuffer())
}

async function loadProbeBuffer(url: string): Promise<Buffer | null> {
  const head = await fetchByteRange(url, 0, PROBE_CHUNK_BYTES - 1)
  if (head && findBoxRecursive(head, 'moov', 0, head.length) !== null) {
    return head
  }

  let contentLength = 0
  const headRes = await fetchWithTimeout(url, { method: 'HEAD' })
  if (headRes?.ok) {
    contentLength = parseInt(headRes.headers.get('content-length') || '0', 10)
  }

  if (contentLength > PROBE_CHUNK_BYTES) {
    const tailStart = Math.max(0, contentLength - PROBE_CHUNK_BYTES)
    const tail = await fetchByteRange(url, tailStart, contentLength - 1)
    if (tail) return tail
  }

  return head
}

export async function probeVideoUrl(
  videoUrl: string,
  defaultDuration = 8
): Promise<VideoMetadataWithFallback> {
  try {
    const buffer = await loadProbeBuffer(videoUrl)
    if (!buffer || buffer.length === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7360/ingest/e706df41-42db-4fc9-8faf-adc2def9c83f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1de77'},body:JSON.stringify({sessionId:'a1de77',location:'lib/video-metadata.ts:probeVideoUrl',message:'probe buffer empty',data:{defaultDuration},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      console.log('[video-metadata] probe buffer empty, using fallback', { defaultDuration })
      // #endregion
      return fallbackVideoMetadata(defaultDuration)
    }

    const result = parseMp4Metadata(buffer, defaultDuration)
    // #region agent log
    fetch('http://127.0.0.1:7360/ingest/e706df41-42db-4fc9-8faf-adc2def9c83f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1de77'},body:JSON.stringify({sessionId:'a1de77',location:'lib/video-metadata.ts:probeVideoUrl',message:'probe result',data:{source:result.source,durationSeconds:result.durationSeconds},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    console.log('[video-metadata] probe result', result)
    // #endregion
    return result
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7360/ingest/e706df41-42db-4fc9-8faf-adc2def9c83f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1de77'},body:JSON.stringify({sessionId:'a1de77',location:'lib/video-metadata.ts:probeVideoUrl',message:'probe error',data:{error:err instanceof Error?err.message:String(err),defaultDuration},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    console.error('[video-metadata] probe error', err)
    // #endregion
    return fallbackVideoMetadata(defaultDuration)
  }
}

export function metadataForClipDuration(clipDuration = 8): VideoMetadataWithFallback {
  return fallbackVideoMetadata(clipDuration)
}
