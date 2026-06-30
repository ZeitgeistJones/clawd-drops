import { NextRequest, NextResponse } from 'next/server'
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
      forceProvider,
    } = await req.json()

    if (!Array.isArray(prompts) || !prompts[0]) {
      return NextResponse.json({ error: 'No clip prompts provided' }, { status: 400 })
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'No styled image URL provided' }, { status: 400 })
    }

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
      duration,
      totalClips,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Video generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
