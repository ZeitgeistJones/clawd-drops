import { NextRequest, NextResponse } from 'next/server'
import { wrapVideoClipPrompt } from '../../../lib/clip-prompts'
import {
  pollVideoTask,
  submitVideoClipWithFallback,
} from '../../../lib/video-providers'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const {
      clipIndex = 0,
      prompt,
      referenceImageUrl,
      model = 'seedance-2-0-fast',
      duration = 8,
      totalClips = 1,
      continuesFromPriorFrame = false,
    } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'No prompt provided' }, { status: 400 })
    }
    if (!referenceImageUrl || typeof referenceImageUrl !== 'string') {
      return NextResponse.json({ error: 'No reference image URL' }, { status: 400 })
    }

    const idx = Number(clipIndex)
    const total = Math.max(1, Number(totalClips) || 1)
    const clipDuration = Number(duration) || 8

    const wrappedPrompt = wrapVideoClipPrompt(
      prompt,
      idx,
      total,
      clipDuration,
      { continuesFromPriorFrame: idx > 0 && continuesFromPriorFrame }
    )

    const submitResult = await submitVideoClipWithFallback({
      prompt: wrappedPrompt,
      imageUrl: referenceImageUrl,
      model: model === 'flipbook' ? 'seedance-2-0-fast' : model,
      duration: clipDuration,
      returnLastFrame: idx < total - 1,
    })

    if (!('taskId' in submitResult)) {
      return NextResponse.json(
        { error: submitResult.error, providerErrors: submitResult.providerErrors },
        { status: 502 }
      )
    }

    let provider = submitResult.provider
    const taskId = submitResult.taskId

    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 10000))
      const pollResult = await pollVideoTask(provider, taskId)
      if (pollResult.status === 'failed') {
        return NextResponse.json({ error: 'Clip regeneration failed' }, { status: 502 })
      }
      if (pollResult.status === 'completed' && pollResult.videoUrl) {
        const lastFrameUrl =
          'lastFrameUrl' in pollResult && typeof pollResult.lastFrameUrl === 'string'
            ? pollResult.lastFrameUrl
            : undefined
        return NextResponse.json({
          videoUrl: pollResult.videoUrl,
          provider,
          lastFrameUrl: lastFrameUrl ?? null,
        })
      }
    }

    return NextResponse.json({ error: 'Clip regeneration timed out' }, { status: 504 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Regenerate failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
