import { CURATED_FALLBACK_TRACKS, resolveCuratedTrack } from './fallback-tracks'
import { wrapPreviewAudioUrl } from './preview-audio'

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

const BROWSE_EXCLUDE_TERMS = [
  'wasteland', 'wastelander', 'apocalyptic', 'desert', 'folk', 'acoustic',
  'indie folk', 'country', 'ballad', 'singer-songwriter', 'world music',
] as const

const IDEAL_DROP_MIN = 4
const IDEAL_DROP_MAX = 8
const MAX_BROWSE_DROP_SEC = 25
const PREVIEW_LEAD_SEC = 3

const BRIGHT_AVOID_TERMS = [
  'future', 'bounce', 'pluck', 'melody', 'lead', 'festival', 'sparkle', 'chiptune',
  'happy', 'cheerful', 'bright', 'pop', 'heaven', 'bounce',
] as const

const BASS_PREFER_TERMS = [
  'dubstep', 'trap', '808', 'sub', 'sub-bass', 'subbass', 'growl', 'brostep', 'wobble',
  'reese', 'bassline', 'bass-drop', 'bassdrop',
] as const

const DROP_PREFER_TERMS = [
  'drop', 'bass', 'beat', 'loop', '808', 'dubstep', 'trap', 'brostep',
  'kick', 'snare', 'drums', 'electro', 'techno', 'club', 'build',
  'edm', 'electronic', 'dance', 'house', 'synth',
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
  fallbackReason?: string
  dropSeconds?: number
  previewStartSeconds?: number
  durationSeconds?: number
  recommended?: boolean
}

type FreesoundTrack = {
  name?: string
  username?: string
  tags?: string[]
  duration?: number
  previews?: Record<string, string>
}

function estimateDropSeconds(title: string, tags: string, durationSec?: number): number {
  const text = `${title} ${tags}`.toLowerCase()
  if (/\bdrop\b/.test(text) && durationSec != null && durationSec <= 30) {
    return Math.min(10, Math.max(IDEAL_DROP_MIN, Math.round(durationSec * 0.35)))
  }
  if (/\b(loop|loops)\b/.test(text) && durationSec != null) {
    return Math.min(12, Math.max(IDEAL_DROP_MIN, Math.round(durationSec * 0.25)))
  }
  if (/\b(dubstep|trap|808|bassdrop|bass-drop|brostep|wobble)\b/.test(text)) return 6
  if (durationSec != null && durationSec <= 45) {
    return Math.min(10, Math.max(IDEAL_DROP_MIN, Math.round(durationSec * 0.3)))
  }
  if (durationSec != null && durationSec <= 120) {
    return Math.min(12, Math.round(durationSec * 0.15))
  }
  return 7
}

function previewStartFromDrop(dropSeconds: number): number {
  return Math.max(0, dropSeconds - PREVIEW_LEAD_SEC)
}

function scoreEarlyDrop(dropSeconds: number): number {
  if (dropSeconds >= IDEAL_DROP_MIN && dropSeconds <= IDEAL_DROP_MAX) return 25
  if (dropSeconds <= 10) return 15
  if (dropSeconds <= 12) return 8
  if (dropSeconds <= 18) return 0
  if (dropSeconds <= 25) return -8
  return -20
}

type FreesoundSearchOpts = {
  dropIntent: boolean
  useBpmFilter: boolean
  requireMusicTag: boolean
  strictScoring: boolean
  applySoftQueryExclusions: boolean
}

function applyFreesoundMusicConstraints(
  query: string,
  dropIntent: boolean,
  applySoftQueryExclusions: boolean
): string {
  const exclusions = FREESOUND_EXCLUDE_TERMS.map(t => `-${t}`).join(' ')
  const softExclusions = dropIntent && applySoftQueryExclusions
    ? SOFT_MUSIC_TERMS.slice(0, 12).map(t => `-${t.replace(/\s+/g, '-')}`).join(' ')
    : ''
  return `${query.trim()} ${exclusions} ${softExclusions}`.trim()
}

function textContainsTerm(text: string, terms: readonly string[]): boolean {
  const normalized = text.toLowerCase()
  return terms.some(term => normalized.includes(term))
}

function isExcludedFreesoundTrack(track: FreesoundTrack, dropIntent: boolean): boolean {
  const haystacks = [track.name || '', ...(track.tags || [])]
  for (const text of haystacks) {
    if (textContainsTerm(text, FREESOUND_POST_FILTER_EXCLUDE)) return true
    if (textContainsTerm(text, BROWSE_EXCLUDE_TERMS)) return true
    if (dropIntent && textContainsTerm(text, SOFT_MUSIC_TERMS)) return true
  }
  return false
}

function scoreTrackText(text: string, dropIntent: boolean): number {
  if (!dropIntent) return 1

  let score = 0
  for (const term of DROP_PREFER_TERMS) {
    if (text.includes(term)) score += 2
  }
  for (const term of BASS_PREFER_TERMS) {
    if (text.includes(term)) score += 4
  }
  for (const term of BRIGHT_AVOID_TERMS) {
    if (text.includes(term)) score -= 5
  }
  if (text.includes('drop')) score += 4
  if (text.includes('bass')) score += 3
  if (text.includes('808') || text.includes('dubstep') || text.includes('trap')) score += 5

  return score
}

function scoreFreesoundTrack(track: FreesoundTrack, dropIntent: boolean): number {
  if (isExcludedFreesoundTrack(track, dropIntent)) return -1
  const haystacks = [track.name || '', ...(track.tags || [])].join(' ').toLowerCase()
  return scoreTrackText(haystacks, dropIntent)
}

function hasDropIntent(mood: string, tokens: string[]): boolean {
  const normalized = mood.toLowerCase()
  return tokens.some(t => (DROP_INTENT_TERMS as readonly string[]).includes(t))
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
    return ['dubstep', 'bass', 'drop', '808']
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
      `${moodPart} dubstep trap 808 sub bass drop`.trim(),
      'dubstep bass drop 808 sub wobble',
      'trap bass drop beat instrumental',
      'heavy sub bass drop loop',
    ]
  }

  const strict = tokens.slice(0, 3).join(' ')
  let broad = tokens.length >= 2 ? tokens.slice(0, 2).join(' ') : tokens[0]
  if (broad === strict) broad = tokens.length >= 2 ? tokens[0] : 'instrumental music'
  return [strict, broad]
}

function buildJamendoTags(tokens: string[], dropIntent: boolean): string[] {
  if (dropIntent) {
    return ['dubstep', 'trap', 'bass', '808']
  }
  return tokens.filter(t => t !== 'music').slice(0, 3)
}

function pickTopFreesoundTracks(
  results: FreesoundTrack[],
  dropIntent: boolean,
  strictScoring: boolean,
  limit: number
) {
  const ranked: ScoredCandidate[] = []

  for (const track of results) {
    const score = scoreFreesoundTrack(track, dropIntent)
    if (score < 0) continue

    const audioUrl = track.previews?.['preview-hq-mp3'] || track.previews?.['preview-lq-mp3']
    if (!audioUrl) continue

    if (dropIntent && strictScoring && score === 0) continue

    const tags = (track.tags || []).join(' ')
    const durationSeconds = typeof track.duration === 'number' ? track.duration : undefined
    const dropSeconds = estimateDropSeconds(track.name || '', tags, durationSeconds)
    if (dropSeconds > MAX_BROWSE_DROP_SEC) continue

    ranked.push({
      audioUrl,
      title: track.name,
      creator: track.username,
      source: 'freesound',
      durationSeconds,
      dropSeconds,
      score: score + scoreEarlyDrop(dropSeconds),
    })
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit)
}

function pickBestFreesoundTrack(
  results: FreesoundTrack[],
  dropIntent: boolean,
  strictScoring: boolean
) {
  const top = pickTopFreesoundTracks(results, dropIntent, strictScoring, 1)
  return top[0] ? { audioUrl: top[0].audioUrl, title: top[0].title, creator: top[0].creator } : null
}

async function fetchFreesoundResults(query: string, opts: FreesoundSearchOpts) {
  if (!process.env.FREESOUND_API_KEY?.trim()) return null

  const fields = ['id', 'name', 'username', 'license', 'duration', 'previews', 'tags'].join(',')
  const filterParts = [
    'license:("Creative Commons 0")',
    'duration:[15 TO 240]',
  ]
  if (opts.requireMusicTag) {
    filterParts.push(`tag:${FREESOUND_MUSIC_TAG}`)
  }
  if (opts.dropIntent && opts.useBpmFilter) {
    filterParts.push('bpm:[128 TO 150]')
  }

  const constrainedQuery = applyFreesoundMusicConstraints(
    opts.requireMusicTag ? `${query} tag:${FREESOUND_MUSIC_TAG}` : query,
    opts.dropIntent,
    opts.applySoftQueryExclusions
  )

  const url = new URL('https://freesound.org/apiv2/search/text/')
  url.searchParams.set('query', constrainedQuery)
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

async function searchFreesound(query: string, opts: FreesoundSearchOpts) {
  if (!process.env.FREESOUND_API_KEY?.trim()) return null

  const bpmPasses = opts.dropIntent ? [true, false] : [false]
  for (const useBpmFilter of bpmPasses) {
    try {
      const results = await fetchFreesoundResults(query, { ...opts, useBpmFilter })
      if (!results?.length) continue

      const picked = pickBestFreesoundTrack(results, opts.dropIntent, opts.strictScoring)
      if (picked) return picked
    } catch {
      // try next pass
    }
  }

  return null
}

function isExcludedJamendoTrack(track: { name?: string; tags?: string }, dropIntent: boolean): boolean {
  const text = `${track.name || ''} ${typeof track.tags === 'string' ? track.tags : ''}`.toLowerCase()
  if (textContainsTerm(text, FREESOUND_POST_FILTER_EXCLUDE)) return true
  if (textContainsTerm(text, BROWSE_EXCLUDE_TERMS)) return true
  if (dropIntent && textContainsTerm(text, SOFT_MUSIC_TERMS)) return true
  return false
}

function scoreJamendoTrack(track: { name?: string; tags?: string }, dropIntent: boolean): number {
  if (isExcludedJamendoTrack(track, dropIntent)) return -1
  const text = `${track.name || ''} ${typeof track.tags === 'string' ? track.tags : ''}`.toLowerCase()
  return scoreTrackText(text, dropIntent)
}

async function listJamendoCandidates(
  tokens: string[],
  dropIntent: boolean,
  limit: number
): Promise<ScoredCandidate[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return []

  const jamendoTags = buildJamendoTags(tokens, dropIntent)
  const url = new URL('https://api.jamendo.com/v3.0/tracks/')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '30')
  url.searchParams.set('tags', jamendoTags.join('+'))
  url.searchParams.set('vocalinstrumental', 'instrumental')
  url.searchParams.set('order', 'relevance_desc')

  const res = await fetch(url.toString())
  if (!res.ok) return []

  const data = await res.json()
  const results = data.results || []
  const ranked: ScoredCandidate[] = []

  for (const track of results) {
    const score = scoreJamendoTrack(track, dropIntent)
    if (score < 0) continue
    const audioUrl = track.audio || track.audiodownload
    if (!audioUrl) continue
    const durationSeconds = typeof track.duration === 'number' ? track.duration : undefined
    const tags = typeof track.tags === 'string' ? track.tags : ''
    const dropSeconds = estimateDropSeconds(track.name || '', tags, durationSeconds)
    if (dropSeconds > MAX_BROWSE_DROP_SEC) continue
    ranked.push({
      audioUrl,
      title: track.name,
      creator: track.artist_name,
      source: 'jamendo',
      durationSeconds,
      dropSeconds,
      score: score + scoreEarlyDrop(dropSeconds),
    })
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit)
}

async function searchJamendo(tokens: string[], dropIntent: boolean, strictScoring: boolean) {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return { result: null, reason: 'jamendo_not_configured' as const }

  const jamendoTags = buildJamendoTags(tokens, dropIntent)
  const url = new URL('https://api.jamendo.com/v3.0/tracks/')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '15')
  url.searchParams.set('tags', jamendoTags.join('+'))
  url.searchParams.set('vocalinstrumental', 'instrumental')
  url.searchParams.set('order', 'relevance_desc')

  const res = await fetch(url.toString())
  if (!res.ok) return { result: null, reason: 'jamendo_error' as const }

  const data = await res.json()
  const results = data.results || []
  if (results.length === 0) return { result: null, reason: 'jamendo_empty' as const }

  let best: { track: typeof results[0]; score: number } | null = null
  for (const track of results) {
    const score = scoreJamendoTrack(track, dropIntent)
    if (score < 0) continue
    if (dropIntent && strictScoring && score === 0) continue

    const audioUrl = track.audio || track.audiodownload
    if (!audioUrl) continue

    if (!best || score > best.score) {
      best = { track, score }
    }
  }

  if (!best) return { result: null, reason: 'jamendo_no_match' as const }

  return {
    result: {
      audioUrl: best.track.audio || best.track.audiodownload,
      title: best.track.name,
      creator: best.track.artist_name,
    },
    reason: undefined,
  }
}

async function useCuratedFallback(
  mood: string,
  dropIntent: boolean,
  siteOrigin?: string,
  reason = 'search_empty'
): Promise<LibraryMusicResult> {
  const curated = await resolveCuratedFallback(mood, dropIntent, siteOrigin)
  return {
    audioUrl: curated.audioUrl,
    source: 'fallback',
    title: curated.title,
    creator: curated.creator,
    dropSeconds: curated.dropSeconds,
    fallbackReason: curated.fallbackReason,
  }
}

const STRICT_FS: Omit<FreesoundSearchOpts, 'query'> = {
  dropIntent: true,
  useBpmFilter: true,
  requireMusicTag: true,
  strictScoring: true,
  applySoftQueryExclusions: true,
}

const RELAXED_FS: Omit<FreesoundSearchOpts, 'query'> = {
  dropIntent: true,
  useBpmFilter: false,
  requireMusicTag: true,
  strictScoring: false,
  applySoftQueryExclusions: true,
}

const BROAD_FS: Omit<FreesoundSearchOpts, 'query'> = {
  dropIntent: true,
  useBpmFilter: false,
  requireMusicTag: false,
  strictScoring: false,
  applySoftQueryExclusions: false,
}

export async function searchLibraryMusic(
  mood: string,
  siteOrigin?: string
): Promise<LibraryMusicResult> {
  const tokens = extractMoodTokens(mood || 'edm drop electronic')
  const dropIntent = hasDropIntent(mood, tokens)
  const queries = buildFreesoundQueries(tokens, dropIntent)

  let lastJamendoReason: string | undefined

  if (dropIntent) {
    const jamendoStrict = await searchJamendo(tokens, true, true)
    lastJamendoReason = jamendoStrict.reason
    if (jamendoStrict.result) {
      return { ...jamendoStrict.result, source: 'jamendo' }
    }

    for (const query of queries.slice(0, 3)) {
      const result = await searchFreesound(query, { ...STRICT_FS, dropIntent: true })
      if (result) return { ...result, source: 'freesound', query }
    }

    const jamendoRelaxed = await searchJamendo(tokens, true, false)
    lastJamendoReason = jamendoRelaxed.reason
    if (jamendoRelaxed.result) {
      return { ...jamendoRelaxed.result, source: 'jamendo' }
    }

    for (const query of queries) {
      const result = await searchFreesound(query, { ...RELAXED_FS, dropIntent: true })
      if (result) return { ...result, source: 'freesound', query }
    }

    const broadResult = await searchFreesound('dubstep bass drop 808 sub', { ...BROAD_FS, dropIntent: true })
    if (broadResult) return { ...broadResult, source: 'freesound', query: 'dubstep bass drop 808 sub' }

    return useCuratedFallback(
      mood,
      true,
      siteOrigin,
      lastJamendoReason || 'search_empty'
    )
  }

  try {
    const strictResult = await searchFreesound(queries[0], {
      dropIntent: false,
      useBpmFilter: false,
      requireMusicTag: true,
      strictScoring: false,
      applySoftQueryExclusions: false,
    })
    if (strictResult) {
      return { ...strictResult, source: 'freesound', query: queries[0] }
    }
  } catch {
    // continue
  }

  const jamendoResult = await searchJamendo(tokens, false, false)
  lastJamendoReason = jamendoResult.reason
  if (jamendoResult.result) {
    return { ...jamendoResult.result, source: 'jamendo' }
  }

  if (queries[1]) {
    const broadResult = await searchFreesound(queries[1], {
      dropIntent: false,
      useBpmFilter: false,
      requireMusicTag: true,
      strictScoring: false,
      applySoftQueryExclusions: false,
    })
    if (broadResult) {
      return { ...broadResult, source: 'freesound', query: queries[1] }
    }
  }

  return useCuratedFallback(mood, false, siteOrigin, lastJamendoReason || 'search_empty')
}

type ScoredCandidate = LibraryMusicResult & { score: number }

function candidateKey(item: ScoredCandidate): string {
  if (item.title || item.creator) {
    return `${item.source}:${item.title || ''}:${item.creator || ''}`
  }
  return item.audioUrl
}

function mergeCandidates(existing: ScoredCandidate[], incoming: ScoredCandidate[]) {
  const byKey = new Map(existing.map(item => [candidateKey(item), item]))
  for (const item of incoming) {
    const key = candidateKey(item)
    const prev = byKey.get(key)
    if (!prev || item.score > prev.score) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.score - a.score)
}

function finalizeBrowseResults(candidates: ScoredCandidate[], limit: number): LibraryMusicResult[] {
  const enriched = candidates.map(c => {
    const dropSeconds = c.dropSeconds ?? estimateDropSeconds(
      c.title || '',
      c.query || '',
      c.durationSeconds
    )
    const previewStartSeconds = previewStartFromDrop(dropSeconds)
    const earlyBonus = c.dropSeconds == null ? scoreEarlyDrop(dropSeconds) : 0
    return {
      ...c,
      dropSeconds,
      previewStartSeconds,
      score: c.score + earlyBonus,
    }
  })

  const filtered = enriched.filter(c => {
    if (c.source === 'fallback') return c.score > -10
    return (c.dropSeconds ?? 99) <= MAX_BROWSE_DROP_SEC && c.score > -10
  })
  filtered.sort((a, b) => b.score - a.score)
  const top = filtered.slice(0, limit)
  const topScore = top[0]?.score ?? 0

  return top.map((c, i) => {
    const { score: _score, ...rest } = c
    return {
      ...rest,
      recommended: i < 2 && c.score >= topScore - 4,
    }
  })
}

function withPreviewUrls(tracks: LibraryMusicResult[], siteOrigin?: string): LibraryMusicResult[] {
  if (!siteOrigin) return tracks
  return tracks.map(track => ({
    ...track,
    audioUrl: wrapPreviewAudioUrl(track.audioUrl, siteOrigin),
  }))
}

export async function browseLibraryMusic(
  mood: string,
  siteOrigin?: string,
  limit = 8
): Promise<LibraryMusicResult[]> {
  const tokens = extractMoodTokens(mood || 'dubstep bass drop 808')
  const dropIntent = hasDropIntent(mood, tokens) || true
  const queries = buildFreesoundQueries(tokens, dropIntent)
  const fetchLimit = Math.max(limit * 2, 16)
  let merged: ScoredCandidate[] = []

  for (const track of CURATED_FALLBACK_TRACKS) {
    const curated = await resolveCuratedTrack(track, siteOrigin)
    const moodScore = scoreTrackText(`${mood} ${track.tags.join(' ')}`, true)
    merged = mergeCandidates(merged, [{
      audioUrl: curated.audioUrl,
      title: curated.title,
      creator: curated.creator,
      source: 'fallback',
      dropSeconds: track.dropSeconds,
      fallbackReason: curated.fallbackReason,
      score: moodScore + scoreEarlyDrop(track.dropSeconds) + (track.id.includes('dubstep') ? 8 : 0),
    }])
  }

  const jamendo = await listJamendoCandidates(tokens, dropIntent, fetchLimit)
  merged = mergeCandidates(merged, jamendo)

  const fsOpts = { ...RELAXED_FS, dropIntent: true as const }
  for (const query of queries) {
    try {
      const results = await fetchFreesoundResults(query, fsOpts)
      if (!results?.length) continue
      const top = pickTopFreesoundTracks(results, dropIntent, false, Math.ceil(fetchLimit / 2))
      merged = mergeCandidates(merged, top.map(track => ({ ...track, query })))
    } catch {
      // continue
    }
  }

  if (merged.length === 0) {
    const single = await searchLibraryMusic(mood, siteOrigin)
    const dropSeconds = single.dropSeconds ?? estimateDropSeconds(single.title || '', mood)
    return withPreviewUrls([{
      ...single,
      dropSeconds,
      previewStartSeconds: previewStartFromDrop(dropSeconds),
      recommended: true,
    }], siteOrigin)
  }

  return withPreviewUrls(finalizeBrowseResults(merged, limit), siteOrigin)
}
