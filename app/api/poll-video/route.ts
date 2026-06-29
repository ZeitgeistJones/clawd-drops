import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { taskId, completedClips = [], nextClipIndex, prompts, imageUrl, beat, model, duration, totalClips } = await req.json()

    const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
    })
    const data = await poll.json()

    const status = data.status || data.data?.status
    const videoUrl = data.data?.results?.[0] || data.results?.[0]
    const lastFrameUrl = data.data?.last_frame_url  // fixed field name

    if (status === 'completed' && videoUrl) {
      const newCompletedClips = [...completedClips, videoUrl]
      const nextIndex = nextClipIndex ?? newCompletedClips.length

      // If more clips to generate
      if (nextIndex < totalClips) {
        const nextPrompt = `${prompts[nextIndex]} @Image1 is the character reference. Peak explosive action at second ${beat?.peak || 3.5}.`
        const nextImageUrl = lastFrameUrl || imageUrl

        const res = await fetch('https://api.seedance2.ai/v1/videos/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: {
              prompt: nextPrompt,
              generation_type: 'reference-to-video',
              image_urls: [nextImageUrl],
              duration,
              resolution: '480p',
              watermark: false,
              generate_audio: true,
              return_last_frame: nextIndex < totalClips - 1,
            },
          }),
        })
        const nextData = await res.json()
        const nextTaskId = nextData.taskId || nextData.id
        if (!nextTaskId) throw new Error(`Clip ${nextIndex + 1} failed: ` + JSON.stringify(nextData))

        return NextResponse.json({
          status: `clip${nextIndex}_done`,
          completedClips: newCompletedClips,
          nextTaskId,
          nextClipIndex: nextIndex + 1,
        })
      }

      // All clips done
      return NextResponse.json({
        status: 'completed',
        completedClips: newCompletedClips,
      })
    }

    if (status === 'failed') throw new Error('Seedance failed: ' + JSON.stringify(data))
    return NextResponse.json({ status: status || 'processing' })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
