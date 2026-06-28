import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { taskId, taskId2, prompt2, imageUrl, beat } = await req.json()

    const poll = await fetch(`https://api.seedance2.ai/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}` },
    })
    const data = await poll.json()

    const status = data.status || data.data?.status
    const videoUrl = data.data?.results?.[0] || data.results?.[0]
    const lastFrameUrl = data.data?.last_frame || data.last_frame

    if (status === 'completed' && videoUrl) {
      // If this was clip 1 and we need clip 2
      if (!taskId2 && prompt2) {
        const beatPrompt2 = `${prompt2} @Image1 is the character reference. Peak explosive action at second ${beat?.peak || 3.5}.`
        const clip2ImageUrl = lastFrameUrl || imageUrl

        const res2 = await fetch('https://api.seedance2.ai/v1/videos/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SEEDANCE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'seedance-2-0-fast',
            input: {
              prompt: beatPrompt2,
              generation_type: 'reference-to-video',
              image_urls: [clip2ImageUrl],
              duration: 5,
              resolution: '480p',
              watermark: false,
              generate_audio: true,
              return_last_frame: false,
            },
          }),
        })
        const data2 = await res2.json()
        const newTaskId2 = data2.taskId || data2.id
        if (!newTaskId2) throw new Error('Clip 2 failed: ' + JSON.stringify(data2))

        return NextResponse.json({
          status: 'clip1_done',
          videoUrl1: videoUrl,
          taskId2: newTaskId2,
        })
      }

      // Clip 2 done
      return NextResponse.json({ status: 'completed', videoUrl })
    }

    if (status === 'failed') throw new Error('Seedance failed: ' + JSON.stringify(data))
    return NextResponse.json({ status: status || 'processing' })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
