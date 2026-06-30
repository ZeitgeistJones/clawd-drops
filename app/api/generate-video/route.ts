import { NextRequest, NextResponse } from 'next/server'
import {
  submitVideoClipWithFallback,
  isVideoProvider,
  type VideoProvider,
} from '../../../lib/video-providers'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const {
      prompts,
      imageUrl,
      beat,
      model = 'seedance-2-0-fast',
      duration = 5,
      forceProvider,
    } = await req.json()
    const safeBeat = beat || { drop: 2.0, peak: 3.5 }

    const firstPrompt = `${prompts[0]} @Image1 is the character reference. Slow atmospheric build, tension rising.`
    const totalClips = prompts.length

    const forced = forceProvider && isVideoProvider(forceProvider) ? forceProvider : undefined
    const submitResult = await submitVideoClipWithFallback(
      {
        prompt: firstPrompt,
        imageUrl,
        model,
        duration,
        returnLastFrame: true,
      },
      forced
    )

    if (!('taskId' in submitResult)) {
      throw new Error('Clip 1 failed on all providers: ' + submitResult.error)
    }

    return NextResponse.json({
      taskId1: submitResult.taskId,
      provider: submitResult.provider,
      prompts,
      imageUrl,
      beat: safeBeat,
      model,
      duration,
      totalClips,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
