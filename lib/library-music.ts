const SOUNDHELIX_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

const FREESOUND_MUSIC_TAG = 'music'
const FREESOUND_EXCLUDE_TERMS = [
  'birds', 'nature', 'ambient', 'field-recording', 'rain', 'wind',
] as const
const FREESOUND_POST_FILTER_EXCLUDE = [
  ...FREESOUND_EXCLUDE_TERMS,
  'forest', 'ocean', 'thunder', 'cricket', 'insect',
] as const

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'with', 'for', 'of', 'in', 'on', 'at', 'to', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'that', 'this', 'these',
  'those', 'it', 'its', 'as', 'by', 'from', 'into', 'through', 'during', 'before', 'after',
  'very', 'just', 'also', 'style', 'high', 'low', 'like', 'featuring', 'feat', 'using',
])

export type LibraryMusicResult = {
  audioUrl: string
  source: 'freesound' | 'jamendo' | 'fallback'
  title?: string
  creator?: string
  query?: string
}

function applyFreesoundMusicConstraints(query: string): string {
  const exclusions = FREESOUND_EXCLUDE_TERMS.map(t => `-${t}`).join(' ')
  return `${query.trim()} tag:${FREESOUND_MUSIC_TAG} ${exclusions}`.trim()
}

function textContainsExcludedTerm(text: string): boolean {
  const normalized = text.toLowerCase()
  return FREESOUND_POST_FILTER_EXCLUDE.some(term => normalized.includes(term))
}

function isExcludedFreesoundTrack(track: { name?: string; tags?: string[] }): boolean {
  if (track.name && textContainsExcludedTerm(track.name)) return true
  const tags = track.tags || []
  return tags.some(tag => textContainsExcludedTerm(tag))
}

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

  if (tokens.length === 0) {
    return ['cinematic', 'instrumental', 'music']
  }

  if (!tokens.includes('music')) {
    tokens.push('music')
  }

  return tokens
}

function buildFreesoundQueries(tokens: string[]): [string, string] {
  const strict = tokens.slice(0, 3).join(' ')
  let broad = tokens.length >= 2 ? tokens.slice(0, 2).join(' ') : tokens[0]
  if (broad === strict) broad = tokens.length >= 2 ? tokens[0] : 'instrumental music'
  return [strict, broad]
}

async function searchFreesound(query: string) {
  const fields = ['id', 'name', 'username', 'license', 'duration', 'previews', 'tags'].join(',')
  const filter = [
    'license:("Creative Commons 0")',
    'duration:[15 TO 240]',
    `tag:${FREESOUND_MUSIC_TAG}`,
  ].join(' ')

  const url = new URL('https://freesound.org/apiv2/search/text/')
  url.searchParams.set('query', applyFreesoundMusicConstraints(query))
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

  for (const track of results) {
    if (isExcludedFreesoundTrack(track)) continue

    const audioUrl = track.previews?.['preview-hq-mp3'] || track.previews?.['preview-lq-mp3']
    if (!audioUrl) continue

    return { audioUrl, title: track.name, creator: track.username }
  }

  return null
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

export async function searchLibraryMusic(mood: string): Promise<LibraryMusicResult> {
  const tokens = extractMoodTokens(mood || 'cinematic instrumental')
  const [strictQuery, broadQuery] = buildFreesoundQueries(tokens)

  try {
    const strictResult = await searchFreesound(strictQuery)
    if (strictResult) {
      return { ...strictResult, source: 'freesound', query: strictQuery }
    }
  } catch {
    // try jamendo / broad freesound
  }

  const jamendoResult = await searchJamendo(tokens)
  if (jamendoResult) {
    return { ...jamendoResult, source: 'jamendo' }
  }

  try {
    const broadResult = await searchFreesound(broadQuery)
    if (broadResult) {
      return { ...broadResult, source: 'freesound', query: broadQuery }
    }
  } catch {
    // fall through to SoundHelix
  }

  return { audioUrl: SOUNDHELIX_URL, source: 'fallback' }
}
