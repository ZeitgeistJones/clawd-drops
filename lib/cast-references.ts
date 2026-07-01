export type CastMode = 'none' | 'refs' | 'keyframe'

export function filterSupportingUrls(urls: (string | null | undefined)[]): string[] {
  return urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
}

export function castReferencePromptSuffix(supportCount: number): string {
  if (supportCount <= 0) return ''
  const parts = ['@Image1 is the main character — preserve face, outfit, and identity exactly.']
  if (supportCount >= 1) {
    parts.push('@Image2 is supporting character A — same face, hair, skin tone, and outfit in every shot.')
  }
  if (supportCount >= 2) {
    parts.push('@Image3 is supporting character B — same face, hair, skin tone, and outfit in every shot.')
  }
  return ` ${parts.join(' ')}`
}

export function buildSeedanceImageUrls(
  primaryImageUrl: string,
  referenceImageUrls?: string[]
): { imageUrls: string[]; useReferenceMode: boolean } {
  const extras = filterSupportingUrls(referenceImageUrls ?? [])
  if (extras.length === 0) {
    return { imageUrls: [primaryImageUrl], useReferenceMode: false }
  }
  return {
    imageUrls: [primaryImageUrl, ...extras].slice(0, 9),
    useReferenceMode: true,
  }
}
