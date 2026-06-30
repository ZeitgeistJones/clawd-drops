import { NextRequest, NextResponse } from 'next/server'
import { searchLibraryMusic } from '../../../lib/library-music'

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json()
    const result = await searchLibraryMusic(mood || 'cinematic instrumental')
    return NextResponse.json({
      audioUrl: result.audioUrl,
      source: result.source,
      title: result.title,
      creator: result.creator,
      query: result.query,
    })
  } catch (err: any) {
    const fallback = await searchLibraryMusic('cinematic instrumental')
    return NextResponse.json({
      audioUrl: fallback.audioUrl,
      source: 'fallback',
      error: err.message,
    })
  }
}
