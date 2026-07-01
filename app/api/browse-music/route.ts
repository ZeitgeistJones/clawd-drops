import { NextRequest, NextResponse } from 'next/server'
import { browseLibraryMusic } from '../../../lib/library-music'

export async function POST(req: NextRequest) {
  try {
    const { mood, limit = 5 } = await req.json()
    const tracks = await browseLibraryMusic(
      mood || 'dubstep bass drop 808',
      req.nextUrl.origin,
      Math.min(8, Math.max(1, Number(limit) || 5))
    )
    return NextResponse.json({ tracks })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Browse failed'
    return NextResponse.json({ error: message, tracks: [] }, { status: 500 })
  }
}
