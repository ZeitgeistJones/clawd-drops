import { NextRequest, NextResponse } from 'next/server'
import { searchLibraryMusic } from '../../../lib/library-music'

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json()
    const siteOrigin = req.nextUrl.origin
    const result = await searchLibraryMusic(mood || 'dubstep bass drop 808', siteOrigin)
    return NextResponse.json({
      audioUrl: result.audioUrl,
      source: result.source,
      title: result.title,
      creator: result.creator,
      query: result.query,
      fallbackReason: result.fallbackReason,
      dropSeconds: result.dropSeconds,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Library search failed'
    const siteOrigin = req.nextUrl.origin
    const fallback = await searchLibraryMusic('edm drop electronic', siteOrigin)
    return NextResponse.json({
      audioUrl: fallback.audioUrl,
      source: 'fallback',
      title: fallback.title,
      creator: fallback.creator,
      fallbackReason: fallback.fallbackReason || 'error',
      dropSeconds: fallback.dropSeconds,
      error: message,
    })
  }
}
