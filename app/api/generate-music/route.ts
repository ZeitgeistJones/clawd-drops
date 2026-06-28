import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Temporary: use a free sample track to test the video pipeline
  return NextResponse.json({ 
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' 
  })
}
