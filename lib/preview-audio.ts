const ALLOWED_PREVIEW_HOSTS = [
  'media.freesound.org',
  'freesound.org',
  'mp3d.jamendo.com',
  'mp3l.jamendo.com',
  'prod-files-secure.s3.us-west-2.amazonaws.com',
] as const

export function isAllowedPreviewUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    if (hostname.endsWith('.jamendo.com')) return true
    return ALLOWED_PREVIEW_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export function absoluteSiteUrl(pathOrUrl: string, siteOrigin: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
  return `${siteOrigin.replace(/\/$/, '')}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

/** Same-origin URL for browser preview (proxies external CDNs). */
export function wrapPreviewAudioUrl(audioUrl: string, siteOrigin: string): string {
  if (!audioUrl?.trim()) return audioUrl
  const absolute = absoluteSiteUrl(audioUrl, siteOrigin)
  try {
    const origin = new URL(siteOrigin).origin
    if (new URL(absolute).origin === origin) return absolute
  } catch {
    // fall through
  }
  if (!isAllowedPreviewUrl(absolute)) return absolute
  return `${siteOrigin.replace(/\/$/, '')}/api/preview-audio?url=${encodeURIComponent(absolute)}`
}
