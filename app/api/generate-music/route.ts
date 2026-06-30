import { NextRequest, NextResponse } from 'next/server'

const SOUNDHELIX_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'with', 'for', 'of', 'in', 'on', 'at', 'to', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'that', 'this', 'these',
  'those', 'it', 'its', 'as', 'by', 'from', 'into', 'through', 'during', 'before', 'after',
  'very', 'just', 'also', 'style', 'high', 'low', 'like', 'featuring', 'feat', 'using',
])

function extractMoodTokens(mood: string): string[] {
  const words = mood
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))

  const seen = new Set<string>()
  const tokens: string[] = []
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word)
      tokens.push(word)
    }
  }

  return tokens.length > 0 ? tokens : ['cinematic', 'instrumental']
}

function buildFreesoundQueries(tokens: string[]): [string, string] {
  const strict = tokens.slice(0, 3).join(' ')

  let broad: string
  if (tokens.length >= 2) {
    broad = tokens.slice(0, 2).join(' ')
  } else {
    broad = tokens[0]
  }

  if (broad === strict) {
    broad = tokens.length >= 2 ? tokens[0] : 'ambient'
  }

  return [strict, broad]
}

async function searchFreesound(query: string) {
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
    headers: { Authorization: `Token ${process.env.FREESOUND_API_KEY}` },
  })

  if (!res.ok) throw new Error('Freesound search failed: ' + res.status)

  const data = await res.json()
  const results = data.results || []
  if (results.length === 0) return null

  const track = results[0]
  const audioUrl = track.previews?.['preview-hq-mp3'] || track.previews?.['preview-lq-mp3']
  if (!audioUrl) return null

  return { audioUrl, title: track.name, creator: track.username }
}

async function searchJamendo(tokens: string[]) {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return null

  const tags = tokens.slice(0, 3).join('+')
  const url = new URL('https://api.jamendo.com/v3.0/tracks/')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '10')
  url.searchParams.set('tags', tags)
  url.searchParams.set('vocalinstrumental', 'instrumental')
  url.searchParams.set('order', 'relevance_desc')

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = await res.json()
  const results = data.results || []
  if (results.length === 0) return null

  const track = results[0]
  const audioUrl = track.audio || track.audiodownload
  if (!audioUrl) return null

  return { audioUrl, title: track.name, creator: track.artist_name }
}

function soundHelixFallback(error?: string) {
  return NextResponse.json({
    audioUrl: SOUNDHELIX_URL,
    source: 'fallback',
    ...(error ? { error } : {}),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json()
    const tokens = extractMoodTokens(mood || 'cinematic instrumental')
    const [strictQuery, broadQuery] = buildFreesoundQueries(tokens)

    for (const query of [strictQuery, broadQuery]) {
      const result = await searchFreesound(query)
      if (result) {
        return NextResponse.json({
          audioUrl: result.audioUrl,
          source: 'freesound',
          title: result.title,
          creator: result.creator,
          query,
        })
      }
    }

    const jamendoResult = await searchJamendo(tokens)
    if (jamendoResult) {
      return NextResponse.json({
        audioUrl: jamendoResult.audioUrl,
        source: 'jamendo',
        title: jamendoResult.title,
        creator: jamendoResult.creator,
      })
    }

    return soundHelixFallback()
  } catch (err: any) {
    return soundHelixFallback(err.message)
  }
}
