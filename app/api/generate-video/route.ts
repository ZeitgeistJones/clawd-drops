import { NextRequest, NextResponse } from 'next/server'
import {
  submitSeedanceClip,
  submitWaveSpeedClip,
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
    let provider: VideoProvider = 'seedance'
    let taskId1: string | undefined
    let seedanceError: string | undefined

    if (forceProvider === 'wavespeed') {
      const wsResult = await submitWaveSpeedClip({ prompt: firstPrompt, imageUrl, duration })
      if ('taskId' in wsResult) {
        provider = 'wavespeed'
        taskId1 = wsResult.taskId
      } else {
        throw new Error('WaveSpeed clip 1 failed: ' + wsResult.error)
      }
    } else {
      const sdResult = await submitSeedanceClip({
        prompt: firstPrompt,
        imageUrl,
        model,
        duration,
        returnLastFrame: true,
      })

      if ('taskId' in sdResult) {
        taskId1 = sdResult.taskId
      } else {
        seedanceError = sdResult.error
        const wsResult = await submitWaveSpeedClip({ prompt: firstPrompt, imageUrl, duration })
        if ('taskId' in wsResult) {
          provider = 'wavespeed'
          taskId1 = wsResult.taskId
        } else {
          throw new Error(
            `Clip 1 failed on both providers. Seedance: ${seedanceError}. WaveSpeed: ${wsResult.error}`
          )
        }
      }
    }

    if (!taskId1) throw new Error('Clip 1 failed: no task ID returned')

    return NextResponse.json({
      taskId1,
      provider,
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
