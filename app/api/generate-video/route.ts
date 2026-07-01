import { NextRequest, NextResponse } from 'next/server'
import { wrapVideoClipPrompt } from '../../../lib/clip-prompts'
import {
  submitVideoClipWithFallback,
  isVideoProvider,
  type VideoProvider,
} from '../../../lib/video-providers'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const {
      prompts,
      imageUrl,
      beat,
      model = 'seedance-2-0-fast',
      duration = 5,
      clipDurations,
      forceProvider,
    } = await req.json()

    if (!Array.isArray(prompts) || !prompts[0]) {
      return NextResponse.json({ error: 'No clip prompts provided' }, { status: 400 })
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'No styled image URL provided' }, { status: 400 })
    }

    const safeBeat = beat || { drop: 2.0, peak: 3.5 }
    const durations: number[] = Array.isArray(clipDurations) && clipDurations.length === prompts.length
      ? clipDurations
      : prompts.map(() => duration)
    const clipDuration = durations[0] ?? duration

    const totalClips = prompts.length
    const firstPrompt = wrapVideoClipPrompt(prompts[0], 0, totalClips, clipDuration)
    const forced = forceProvider && isVideoProvider(forceProvider) ? forceProvider : undefined

    const submitResult = await submitVideoClipWithFallback(
      {
        prompt: firstPrompt,
        imageUrl,
        model: model === 'flipbook' ? 'seedance-2-0-fast' : model,
        duration: clipDuration,
        returnLastFrame: true,
      },
      forced
    )

    if (!('taskId' in submitResult)) {
      return NextResponse.json(
        {
          error: 'Clip 1 failed on all providers',
          providerErrors: submitResult.providerErrors,
          details: submitResult.error,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      taskId1: submitResult.taskId,
      provider: submitResult.provider,
      prompts,
      imageUrl,
      beat: safeBeat,
      model,
      duration: clipDuration,
      clipDurations: durations,
      totalClips,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Video generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
