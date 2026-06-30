import { NextRequest, NextResponse } from 'next/server'
import decodeAudio from 'audio-decode'
import {
  analyzeBeatFromAudioBuffer,
  fallbackBeatAnalysis,
} from '../../../lib/beat-analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let duration = 8
  try {
    const body = await req.json()
    const { audioUrl } = body
    duration = typeof body.duration === 'number' ? body.duration : 8

    if (!audioUrl || typeof audioUrl !== 'string') {
      return NextResponse.json(fallbackBeatAnalysis(duration))
    }

    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      return NextResponse.json(fallbackBeatAnalysis(duration))
    }

    const buffer = await audioRes.arrayBuffer()
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json(fallbackBeatAnalysis(duration))
    }

    const decoded = await decodeAudio(buffer)
    const channelData = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i)
    )

    const result = await analyzeBeatFromAudioBuffer(channelData, decoded.sampleRate)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(fallbackBeatAnalysis(duration))
  }
}
