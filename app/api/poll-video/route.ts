import { NextRequest, NextResponse } from 'next/server'
import {
  pollVideoTask,
  submitVideoClip,
  isVideoProvider,
  PROVIDER_LABELS,
  type VideoProvider,
} from '../../../lib/video-providers'

export async function POST(req: NextRequest) {
  try {
    const {
      taskId,
      completedClips = [],
      nextClipIndex,
      prompts,
      imageUrl,
      beat,
      model,
      duration,
      totalClips,
      provider = 'seedance',
    } = await req.json() as {
      taskId: string
      completedClips?: string[]
      nextClipIndex?: number
      prompts: string[]
      imageUrl: string
      beat?: { peak?: number }
      model: string
      duration: number
      totalClips: number
      provider?: VideoProvider
    }

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
        const nextPrompt = `${prompts[nextIndex]} @Image1 is the character reference. Peak explosive action at second ${beat?.peak || 3.5}.`
        const nextImageUrl: string = lastFrameUrl ?? imageUrl

        const submitResult = await submitVideoClip(videoProvider, {
          prompt: nextPrompt,
          imageUrl: nextImageUrl,
          model,
          duration,
          returnLastFrame: nextIndex < totalClips - 1,
        })

        if (!('taskId' in submitResult)) {
          throw new Error(
            `Clip ${nextIndex + 1} failed (${PROVIDER_LABELS[videoProvider]}): ${submitResult.error}`
          )
        }

        return NextResponse.json({
          status: `clip${nextIndex}_done`,
          completedClips: newCompletedClips,
          nextTaskId: submitResult.taskId,
          nextClipIndex: nextIndex + 1,
          provider: videoProvider,
        })
      }

      return NextResponse.json({ status: 'completed', completedClips: newCompletedClips, provider: videoProvider })
    }

    if (status === 'failed') {
      throw new Error(`${PROVIDER_LABELS[videoProvider]} failed: status=${status}`)
    }

    return NextResponse.json({ status: status || 'processing', provider: videoProvider })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
