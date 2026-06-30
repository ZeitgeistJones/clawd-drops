import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json()
    const query = mood || 'cinematic instrumental'

    const fields = ['id', 'name', 'username', 'license', 'duration', 'previews'].join(',')
    const filter = [
      'license:("Creative Commons 0")',
      'duration:[15 TO 240]',
    ].join(' ')

    const url = new URL('https://freesound.org/apiv2/search/text/')
    url.searchParams.set('query', query)
    url.searchParams.set('filter', filter)
    url.searchParams.set('fields', fields)
    url.searchParams.set('page_size', '10')
    url.searchParams.set('sort', 'rating_desc')

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Token ${process.env.FREESOUND_API_KEY}` },
    })

    if (!res.ok) throw new Error('Freesound search failed: ' + res.status)

    const data = await res.json()
    const results = data.results || []

    if (results.length === 0) {
      return NextResponse.json({
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        source: 'fallback',
      })
    }

    const track = results[0]
    const audioUrl = track.previews?.['preview-hq-mp3'] || track.previews?.['preview-lq-mp3']

    if (!audioUrl) {
      return NextResponse.json({
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        source: 'fallback',
      })
    }

    return NextResponse.json({
      audioUrl,
      source: 'freesound',
      title: track.name,
      creator: track.username,
    })

  } catch (err: any) {
    return NextResponse.json({
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      source: 'fallback',
      error: err.message,
    })
  }
}
