import { NextRequest, NextResponse } from 'next/server'
import { wrapVideoClipPrompt } from '../../../lib/clip-prompts'
import {
  pollVideoTask,
  submitVideoClipWithFallback,
  isVideoProvider,
  type VideoProvider,
} from '../../../lib/video-providers'

import { filterSupportingUrls } from '../../../lib/cast-references'

export async function POST(req: NextRequest) {
  try {
    const {
      taskId,
      completedClips = [],
      nextClipIndex,
      prompts,
      imageUrl,
      referenceImageUrls,
      beat,
      model,
      duration,
      clipDurations,
      totalClips,
      provider = 'seedance',
    } = await req.json() as {
      taskId: string
      completedClips?: string[]
      nextClipIndex?: number
      prompts: string[]
      imageUrl: string
      referenceImageUrls?: string[]
      beat?: { peak?: number }
      model: string
      duration: number
      clipDurations?: number[]
      totalClips: number
      provider?: VideoProvider
    }

    const durations: number[] = Array.isArray(clipDurations) && clipDurations.length === totalClips
      ? clipDurations
      : Array.from({ length: totalClips }, () => duration)

    const supportRefs = filterSupportingUrls(referenceImageUrls ?? [])
    const supportCount = supportRefs.length

    const videoProvider: VideoProvider = isVideoProvider(provider) ? provider : 'seedance'
    const pollResult = await pollVideoTask(videoProvider, taskId)
    const { status, videoUrl } = pollResult
    const lastFrameUrl =
      'lastFrameUrl' in pollResult && typeof pollResult.lastFrameUrl === 'string'
        ? pollResult.lastFrameUrl
        : undefined

    if (status === 'completed' && videoUrl) {
      const newCompletedClips = [...completedClips, videoUrl]
      const nextIndex = nextClipIndex ?? newCompletedClips.length

      if (nextIndex < totalClips) {
        const nextDuration = durations[nextIndex] ?? duration
        const nextPrompt = wrapVideoClipPrompt(
          prompts[nextIndex],
          nextIndex,
          totalClips,
          nextDuration,
          {
            continuesFromPriorFrame: Boolean(lastFrameUrl),
            supportingRefCount: supportCount,
          }
        )
        const nextImageUrl: string = lastFrameUrl ?? imageUrl

        const submitResult = await submitVideoClipWithFallback({
          prompt: nextPrompt,
          imageUrl: nextImageUrl,
          referenceImageUrls: supportCount > 0 ? supportRefs : undefined,
          model: model === 'flipbook' ? 'seedance-2-0-fast' : model,
          duration: nextDuration,
          returnLastFrame: nextIndex < totalClips - 1,
        })

        if (!('taskId' in submitResult)) {
          throw new Error(
            `Clip ${nextIndex + 1} failed on all providers: ${submitResult.error}`
          )
        }

        return NextResponse.json({
          status: `clip${nextIndex}_done`,
          completedClips: newCompletedClips,
          nextTaskId: submitResult.taskId,
          nextClipIndex: nextIndex + 1,
          provider: submitResult.provider,
          lastFrameUrl: lastFrameUrl ?? null,
          clipProvider: videoProvider,
        })
      }

      return NextResponse.json({
        status: 'completed',
        completedClips: newCompletedClips,
        provider: videoProvider,
        lastFrameUrl: lastFrameUrl ?? null,
      })
    }

    if (status === 'failed') {
      throw new Error(`Video provider failed: status=${status}`)
    }

    return NextResponse.json({ status: status || 'processing', provider: videoProvider })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Poll failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
