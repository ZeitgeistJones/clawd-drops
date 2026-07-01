export type CuratedFallbackTrack = {
  id: string
  file: string
  freesoundId: number
  title: string
  creator: string
  license: string
  dropSeconds: number
  bpm: number
  tags: string[]
}

export const CURATED_FALLBACK_TRACKS: CuratedFallbackTrack[] = [
  {
    id: 'edm-room-128',
    file: '/fallbacks/edm-room-128.mp3',
    freesoundId: 634684,
    title: 'The Room - EDM Loop (128 BPM)',
    creator: 'Cloud-10',
    license: 'CC0',
    dropSeconds: 30,
    bpm: 128,
    tags: ['edm', 'dance', 'festival', 'drop', 'build', 'house', 'club'],
  },
  {
    id: 'future-bass-heaven',
    file: '/fallbacks/future-bass-heaven.mp3',
    freesoundId: 634689,
    title: 'Heaven - Future Bass Loop (160 BPM)',
    creator: 'Cloud-10',
    license: 'CC0',
    dropSeconds: 14,
    bpm: 160,
    tags: ['future', 'bass', 'drop', 'edm', 'bounce', 'festival', 'epic'],
  },
  {
    id: 'future-bounce-125',
    file: '/fallbacks/future-bounce-125.mp3',
    freesoundId: 658811,
    title: 'Future Bounce Loop (125 BPM)',
    creator: 'Cloud-10',
    license: 'CC0',
    dropSeconds: 16,
    bpm: 125,
    tags: ['bounce', 'drop', 'dance', 'club', 'edm', 'bass', 'build'],
  },
  {
    id: 'dubstep-sahara-140',
    file: '/fallbacks/dubstep-sahara-140.mp3',
    freesoundId: 634686,
    title: 'Sahara - Dubstep Loop (140 BPM)',
    creator: 'Cloud-10',
    license: 'CC0',
    dropSeconds: 32,
    bpm: 140,
    tags: ['dubstep', 'bass', 'drop', 'edm', 'trap', 'epic', 'festival'],
  },
]

export type CuratedFallbackResult = {
  audioUrl: string
  title: string
  creator: string
  dropSeconds: number
  fallbackReason: 'curated_library' | 'freesound_id_backup'
  trackId: string
}

function scoreTrackForMood(track: CuratedFallbackTrack, mood: string, dropIntent: boolean): number {
  const normalized = mood.toLowerCase()
  let score = 0
  for (const tag of track.tags) {
    if (normalized.includes(tag)) score += 3
  }
  if (dropIntent) {
    if (track.tags.includes('drop')) score += 4
    if (track.tags.includes('edm') || track.tags.includes('bass')) score += 2
  }
  return score
}

export function pickCuratedFallbackTrack(mood: string, dropIntent: boolean): CuratedFallbackTrack {
  let best = CURATED_FALLBACK_TRACKS[0]
  let bestScore = -1

  for (const track of CURATED_FALLBACK_TRACKS) {
    const score = scoreTrackForMood(track, mood, dropIntent)
    if (score > bestScore) {
      best = track
      bestScore = score
    }
  }

  return best
}

async function fetchFreesoundPreviewUrl(soundId: number): Promise<string | null> {
  const apiKey = process.env.FREESOUND_API_KEY?.trim()
  if (!apiKey) return null

  const res = await fetch(`https://freesound.org/apiv2/sounds/${soundId}/`, {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!res.ok) return null

  const data = await res.json()
  return data.previews?.['preview-hq-mp3'] || data.previews?.['preview-lq-mp3'] || null
}

function absoluteAudioUrl(pathOrUrl: string, siteOrigin?: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  if (siteOrigin) {
    return `${siteOrigin.replace(/\/$/, '')}${pathOrUrl}`
  }
  return pathOrUrl
}

async function selfHostedUrlWorks(audioUrl: string): Promise<boolean> {
  if (!audioUrl.startsWith('http')) return false
  try {
    const res = await fetch(audioUrl, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

export async function resolveCuratedFallback(
  mood: string,
  dropIntent: boolean,
  siteOrigin?: string
): Promise<CuratedFallbackResult> {
  const track = pickCuratedFallbackTrack(mood, dropIntent)
  const selfHosted = absoluteAudioUrl(track.file, siteOrigin)

  if (siteOrigin && (await selfHostedUrlWorks(selfHosted))) {
    return {
      audioUrl: selfHosted,
      title: track.title,
      creator: track.creator,
      dropSeconds: track.dropSeconds,
      fallbackReason: 'curated_library',
      trackId: track.id,
    }
  }

  const previewUrl = await fetchFreesoundPreviewUrl(track.freesoundId)
  if (previewUrl) {
    return {
      audioUrl: previewUrl,
      title: track.title,
      creator: track.creator,
      dropSeconds: track.dropSeconds,
      fallbackReason: 'freesound_id_backup',
      trackId: track.id,
    }
  }

  for (const backup of CURATED_FALLBACK_TRACKS) {
    if (backup.id === track.id) continue
    const url = await fetchFreesoundPreviewUrl(backup.freesoundId)
    if (url) {
      return {
        audioUrl: url,
        title: backup.title,
        creator: backup.creator,
        dropSeconds: backup.dropSeconds,
        fallbackReason: 'freesound_id_backup',
        trackId: backup.id,
      }
    }
  }

  return {
    audioUrl: selfHosted,
    title: track.title,
    creator: track.creator,
    dropSeconds: track.dropSeconds,
    fallbackReason: 'curated_library',
    trackId: track.id,
  }
}
