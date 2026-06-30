import { NextRequest, NextResponse } from 'next/server'
import { fallbackVideoMetadata, probeVideoUrl } from '../../../lib/video-metadata'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { videoUrl } = body

    if (!videoUrl || typeof videoUrl !== 'string') {
      return NextResponse.json(fallbackVideoMetadata())
    }

    const result = await probeVideoUrl(videoUrl)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(fallbackVideoMetadata())
  }
}
