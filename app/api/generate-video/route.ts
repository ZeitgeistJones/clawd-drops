import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { videoUrl } = await req.json()

    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error('Failed to fetch video for analysis')
    const videoBuffer = await videoRes.arrayBuffer()
    const base64Video = Buffer.from(videoBuffer).toString('base64')

    const apiKey = process.env.GOOGLE_VIDEO_INTELLIGENCE_API_KEY

    const annotateRes = await fetch(
      `https://videointelligence.googleapis.com/v1/videos:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputContent: base64Video,
          features: ['SHOT_CHANGE_DETECTION', 'LABEL_DETECTION'],
        }),
      }
    )

    if (!annotateRes.ok) {
      const errText = await annotateRes.text()
      throw new Error('Video Intelligence request failed: ' + errText)
    }

    const operation = await annotateRes.json()
    const operationName = operation.name
    if (!operationName) throw new Error('No operation name returned')

    let result = null
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const pollRes = await fetch(
        `https://videointelligence.googleapis.com/v1/${operationName}?key=${apiKey}`
      )
      const pollData = await pollRes.json()
      if (pollData.done) {
        result = pollData.response
        break
      }
    }

    if (!result) throw new Error('Video analysis timed out')

    const annotations = result.annotationResults?.[0]
    const shots = annotations?.shotAnnotations || []
    const labels = annotations?.shotLabelAnnotations || []

    let peakTimestamp = null
    if (shots.length > 1) {
      const secondShot = shots[1]
      const seconds = parseFloat(secondShot.startTimeOffset?.seconds || '0')
      const nanos = parseFloat(secondShot.startTimeOffset?.nanos || '0') / 1e9
      peakTimestamp = seconds + nanos
    }

    const topLabels = labels
      .slice(0, 5)
      .map((l: any) => l.entity?.description)
      .filter(Boolean)

    return NextResponse.json({
      peakTimestamp,
      shotCount: shots.length,
      labels: topLabels,
      source: 'google-video-intelligence',
    })

  } catch (err: any) {
    return NextResponse.json({
      peakTimestamp: null,
      error: err.message,
      source: 'fallback',
    })
  }
}
