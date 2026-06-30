const SOUNDHELIX_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

const FREESOUND_MUSIC_TAG = 'music'
const FREESOUND_EXCLUDE_TERMS = [
  'birds', 'nature', 'ambient', 'field-recording', 'rain', 'wind',
] as const
const FREESOUND_POST_FILTER_EXCLUDE = [
  ...FREESOUND_EXCLUDE_TERMS,
  'forest', 'ocean', 'thunder', 'cricket', 'insect',
] as const

const DROP_INTENT_TERMS = [
  'drop', 'build', 'epic', 'edm', 'bass', 'festival', 'club', 'dance',
  'trap', 'house', 'banger', 'remix', 'beat', 'bassdrop', 'buildup',
] as const

const SOFT_MUSIC_TERMS = [
  'piano', 'soft', 'calm', 'peaceful', 'evolving', 'soundtrack', 'orchestral',
  'lounge', 'chill', 'gentle', 'lullaby', 'meditation', 'documentary',
  'background', 'sci-fi', 'scifi', 'alien', 'strings', 'flute', 'harp',
  'classical', 'slow', 'mellow', 'relax', 'spa', 'yoga', 'sleep', 'study',
  'corporate', 'underscore', 'cinematic bed', 'atmosphere', 'atmospheric',
  'pad', 'drone', 'texture', 'evolve', 'evolving',
] as const

const DROP_PREFER_TERMS = [
  'drop', 'edm', 'electronic', 'dance', 'bass', 'beat', 'loop', 'house',
  'trap', 'festival', 'build', 'club', 'synth', 'electro', 'techno',
  'banger', 'kick', 'snare', 'drums', '808', 'brostep', 'dubstep',
  'bigroom', 'big-room', 'progressive', 'anthem',
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

type FreesoundTrack = {
  name?: string
  username?: string
  tags?: string[]
  previews?: Record<string, string>
}

function applyFreesoundMusicConstraints(query: string, dropIntent: boolean): string {
  const exclusions = FREESOUND_EXCLUDE_TERMS.map(t => `-${t}`).join(' ')
  const softExclusions = dropIntent
    ? SOFT_MUSIC_TERMS.slice(0, 12).map(t => `-${t.replace(/\s+/g, '-')}`).join(' ')
    : ''
  return `${query.trim()} tag:${FREESOUND_MUSIC_TAG} ${exclusions} ${softExclusions}`.trim()
}

function textContainsTerm(text: string, terms: readonly string[]): boolean {
  const normalized = text.toLowerCase()
  return terms.some(term => normalized.includes(term))
}

function isExcludedFreesoundTrack(track: FreesoundTrack, dropIntent: boolean): boolean {
  const haystacks = [track.name || '', ...(track.tags || [])]
  for (const text of haystacks) {
    if (textContainsTerm(text, FREESOUND_POST_FILTER_EXCLUDE)) return true
    if (dropIntent && textContainsTerm(text, SOFT_MUSIC_TERMS)) return true
  }
  return false
}

function scoreFreesoundTrack(track: FreesoundTrack, dropIntent: boolean): number {
  if (isExcludedFreesoundTrack(track, dropIntent)) return -1

  const haystacks = [track.name || '', ...(track.tags || [])].join(' ').toLowerCase()
  if (!dropIntent) return 1

  let score = 0
  for (const term of DROP_PREFER_TERMS) {
    if (haystacks.includes(term)) score += 2
  }
  if (haystacks.includes('drop')) score += 4
  if (haystacks.includes('edm') || haystacks.includes('electronic')) score += 3
  if (haystacks.includes('bass')) score += 2
  if (haystacks.includes('loop') || haystacks.includes('beat')) score += 1

  return score
}

function hasDropIntent(mood: string, tokens: string[]): boolean {
  const normalized = mood.toLowerCase()
  return tokens.some(t => DROP_INTENT_TERMS.includes(t as typeof DROP_INTENT_TERMS[number]))
    || normalized.includes('build drop')
    || normalized.includes('bass drop')
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
    return ['edm', 'drop', 'electronic']
  }

  if (!tokens.includes('music')) {
    tokens.push('music')
  }

  return tokens
}

function buildFreesoundQueries(tokens: string[], dropIntent: boolean): string[] {
  if (dropIntent) {
    const moodPart = tokens
      .filter(t => !['music', 'cinematic', 'instrumental', 'dark', 'epic'].includes(t))
      .slice(0, 2)
      .join(' ')

    return [
      `${moodPart} edm bass drop build`.trim(),
      'electronic dance drop build bass loop',
      'edm festival drop beat instrumental',
    ]
  }

  const strict = tokens.slice(0, 3).join(' ')
  let broad = tokens.length >= 2 ? tokens.slice(0, 2).join(' ') : tokens[0]
  if (broad === strict) broad = tokens.length >= 2 ? tokens[0] : 'instrumental music'
  return [strict, broad]
}

function buildJamendoTags(tokens: string[], dropIntent: boolean): string[] {
  if (dropIntent) {
    return ['electronic', 'edm', 'dance', 'drop']
  }
  return tokens.filter(t => t !== 'music').slice(0, 3)
}

function pickBestFreesoundTrack(results: FreesoundTrack[], dropIntent: boolean) {
  let best: { track: FreesoundTrack; score: number } | null = null

  for (const track of results) {
    const score = scoreFreesoundTrack(track, dropIntent)
    if (score < 0) continue

    const audioUrl = track.previews?.['preview-hq-mp3'] || track.previews?.['preview-lq-mp3']
    if (!audioUrl) continue

    if (dropIntent && score === 0) continue

    if (!best || score > best.score) {
      best = { track, score }
    }
  }

  if (!best) return null

  const audioUrl = best.track.previews?.['preview-hq-mp3'] || best.track.previews?.['preview-lq-mp3']
  if (!audioUrl) return null

  return { audioUrl, title: best.track.name, creator: best.track.username }
}

async function fetchFreesoundResults(query: string, dropIntent: boolean, useBpmFilter: boolean) {
  const fields = ['id', 'name', 'username', 'license', 'duration', 'previews', 'tags'].join(',')
  const filterParts = [
    'license:("Creative Commons 0")',
    'duration:[15 TO 240]',
    `tag:${FREESOUND_MUSIC_TAG}`,
  ]
  if (dropIntent && useBpmFilter) {
    filterParts.push('bpm:[110 TO 150]')
  }

  const url = new URL('https://freesound.org/apiv2/search/text/')
  url.searchParams.set('query', applyFreesoundMusicConstraints(query, dropIntent))
  url.searchParams.set('filter', filterParts.join(' '))
  url.searchParams.set('fields', fields)
  url.searchParams.set('page_size', '20')
  url.searchParams.set('sort', 'rating_desc')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${process.env.FREESOUND_API_KEY}` },
  })
  if (!res.ok) throw new Error('Freesound search failed: ' + res.status)

  const data = await res.json()
  return data.results || []
}

async function searchFreesound(query: string, dropIntent: boolean) {
  for (const useBpmFilter of dropIntent ? [true, false] : [false]) {
    const results = await fetchFreesoundResults(query, dropIntent, useBpmFilter)
    if (results.length === 0) continue

    const picked = pickBestFreesoundTrack(results, dropIntent)
    if (picked) return picked
  }

  return null
}

function isExcludedJamendoTrack(track: { name?: string; tags?: string }, dropIntent: boolean): boolean {
  const text = `${track.name || ''} ${typeof track.tags === 'string' ? track.tags : ''}`.toLowerCase()
  if (textContainsTerm(text, FREESOUND_POST_FILTER_EXCLUDE)) return true
  if (dropIntent && textContainsTerm(text, SOFT_MUSIC_TERMS)) return true
  return false
}

function scoreJamendoTrack(track: { name?: string; tags?: string }, dropIntent: boolean): number {
  if (isExcludedJamendoTrack(track, dropIntent)) return -1
  if (!dropIntent) return 1

  const text = `${track.name || ''} ${typeof track.tags === 'string' ? track.tags : ''}`.toLowerCase()
  let score = 0
  for (const term of DROP_PREFER_TERMS) {
    if (text.includes(term)) score += 2
  }
  return score
}

async function searchJamendo(tokens: string[], dropIntent: boolean) {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return null

  const jamendoTags = buildJamendoTags(tokens, dropIntent)
  const url = new URL('https://api.jamendo.com/v3.0/tracks/')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '15')
  url.searchParams.set('tags', jamendoTags.join('+'))
  url.searchParams.set('vocalinstrumental', 'instrumental')
  url.searchParams.set('order', 'relevance_desc')

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = await res.json()
  const results = data.results || []
  if (results.length === 0) return null

  let best: { track: typeof results[0]; score: number } | null = null
  for (const track of results) {
    const score = scoreJamendoTrack(track, dropIntent)
    if (score < 0) continue
    if (dropIntent && score === 0) continue

    const audioUrl = track.audio || track.audiodownload
    if (!audioUrl) continue

    if (!best || score > best.score) {
      best = { track, score }
    }
  }

  if (!best) return null

  return {
    audioUrl: best.track.audio || best.track.audiodownload,
    title: best.track.name,
    creator: best.track.artist_name,
  }
}

export async function searchLibraryMusic(mood: string): Promise<LibraryMusicResult> {
  const tokens = extractMoodTokens(mood || 'edm drop electronic')
  const dropIntent = hasDropIntent(mood, tokens)
  const queries = buildFreesoundQueries(tokens, dropIntent)

  if (dropIntent) {
    const jamendoResult = await searchJamendo(tokens, true)
    if (jamendoResult) {
      return { ...jamendoResult, source: 'jamendo' }
    }

    for (const query of queries) {
      try {
        const result = await searchFreesound(query, true)
        if (result) {
          return { ...result, source: 'freesound', query }
        }
      } catch {
        // try next query
      }
    }

    return { audioUrl: SOUNDHELIX_URL, source: 'fallback' }
  }

  try {
    const strictResult = await searchFreesound(queries[0], false)
    if (strictResult) {
      return { ...strictResult, source: 'freesound', query: queries[0] }
    }
  } catch {
    // try jamendo / broad freesound
  }

  const jamendoResult = await searchJamendo(tokens, false)
  if (jamendoResult) {
    return { ...jamendoResult, source: 'jamendo' }
  }

  if (queries[1]) {
    try {
      const broadResult = await searchFreesound(queries[1], false)
      if (broadResult) {
        return { ...broadResult, source: 'freesound', query: queries[1] }
      }
    } catch {
      // fall through to SoundHelix
    }
  }

  return { audioUrl: SOUNDHELIX_URL, source: 'fallback' }
}
