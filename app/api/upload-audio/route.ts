import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 60

// App Router note: `export const config.api.bodyParser` is Pages Router only.
// Body size limit for this route is raised via next.config.js experimental.serverActions.bodySizeLimit.

const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
])

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported audio type "${file.type || 'unknown'}". Use MP3, WAV, or M4A.` },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 20MB.` },
        { status: 400 }
      )
    }

    // Vercel Blob does not auto-delete uploaded files — cleanup/TTL should be added later.
    const blob = await put(`audio-uploads/${Date.now()}-${file.name}`, file, {
      access: 'public',
      contentType: file.type,
    })

    return NextResponse.json({ url: blob.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
