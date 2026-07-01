import { NextRequest, NextResponse } from 'next/server'
import { isAllowedPreviewUrl } from '../../../lib/preview-audio'

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (!isAllowedPreviewUrl(target.toString())) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { Accept: 'audio/*,*/*' },
      redirect: 'follow',
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
