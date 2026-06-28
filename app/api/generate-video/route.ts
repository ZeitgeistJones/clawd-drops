import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

async function generateClip(prompt: string, imageUrl: string, returnLastFrame: boolean): Promise<{ videoUrl: string, lastFrameUrl?: string, taskId: string }> {
  const res = await fetch('https://api.seedance2.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'seedance-2-0-fast',
      input: {
        prompt,
        generation_type: 'reference-to-video',
        image_urls: [imageUrl],
        duration: 5,
        resolution: '480p',
        watermark: false,
        generate_audio: true,
        return_last_frame: returnLastFrame,
      },
    }),
  })

  const data = await res.json()
  const taskId = data.taskId || data.id
  if (!taskId) throw new Error('Seedance task failed: ' + JSON.stringify(data))
  return { taskId, videoUrl: '', lastFrameUrl: undefined }
}

async function pollTask(taskId: string): Promise<{ videoUrl: string, lastFrameUrl?: string }> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 10000))
    const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
    })
    const data = await poll.json()
    const status = data.status || data.data?.status
    if (status === 'completed') {
      const videoUrl = data.data?.results?.[0] || data.results?.[0]
      const lastFrameUrl = data.data?.last_frame || data.last_frame
      if (!videoUrl) throw new Error('No video URL in response')
      return { videoUrl, lastFrameUrl }
    }
    if (status === 'failed') throw new Error('Seedance failed: ' + JSON.stringify(data))
  }
  throw new Error('Seedance timed out')
}

export async function POST(req: NextRequest) {
  try {
    const { prompt1, prompt2, imageUrl, beat } = await req.json()
    const safeBeat = beat || { drop: 2.0, peak: 3.5 }

    const beatPrompt1 = `${prompt1} @Image1 is the character reference. Slow atmospheric build, tension rising.`
    const beatPrompt2 = `${prompt2} @Image1 is the character reference. Peak explosive action at second ${safeBeat.peak}.`

    // Generate clip 1 with last frame
    const { taskId: taskId1 } = await generateClip(beatPrompt1, imageUrl, true)
    const { videoUrl: videoUrl1, lastFrameUrl } = await pollTask(taskId1)

    // Use last frame of clip 1 as reference for clip 2
    const clip2ImageUrl = lastFrameUrl || imageUrl
    const { taskId: taskId2 } = await generateClip(beatPrompt2, clip2ImageUrl, false)
    const { videoUrl: videoUrl2 } = await pollTask(taskId2)

    return NextResponse.json({ videoUrl1, videoUrl2 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
