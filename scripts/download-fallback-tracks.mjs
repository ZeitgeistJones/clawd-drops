/**
 * Downloads curated CC0 fallback tracks into public/fallbacks/.
 * Requires FREESOUND_API_KEY in the environment.
 *
 * Usage: FREESOUND_API_KEY=your_key node scripts/download-fallback-tracks.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'fallbacks')

const TRACKS = [
  { file: 'edm-room-128.mp3', freesoundId: 634684 },
  { file: 'future-bass-heaven.mp3', freesoundId: 634689 },
  { file: 'future-bounce-125.mp3', freesoundId: 658811 },
  { file: 'dubstep-sahara-140.mp3', freesoundId: 634686 },
]

const apiKey = process.env.FREESOUND_API_KEY?.trim()
if (!apiKey) {
  console.error('Set FREESOUND_API_KEY before running this script.')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

for (const track of TRACKS) {
  const metaRes = await fetch(`https://freesound.org/apiv2/sounds/${track.freesoundId}/`, {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!metaRes.ok) {
    console.error(`Failed to fetch metadata for ${track.freesoundId}: ${metaRes.status}`)
    continue
  }

  const meta = await metaRes.json()
  const previewUrl = meta.previews?.['preview-hq-mp3'] || meta.previews?.['preview-lq-mp3']
  if (!previewUrl) {
    console.error(`No preview URL for ${track.freesoundId}`)
    continue
  }

  const audioRes = await fetch(previewUrl)
  if (!audioRes.ok) {
    console.error(`Failed to download ${track.file}: ${audioRes.status}`)
    continue
  }

  const buffer = Buffer.from(await audioRes.arrayBuffer())
  const dest = path.join(outDir, track.file)
  fs.writeFileSync(dest, buffer)
  console.log(`Saved ${track.file} (${meta.name})`)
}

console.log('Done.')
