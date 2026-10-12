import { useEffect, useState } from 'react'
import { FALLBACK_IMAGE } from '../story/data'
export function SceneBackdrop({ src, fallback = FALLBACK_IMAGE, position }: { src: string; fallback?: string; position?: string }) {
  const [layers, setLayers] = useState({ shown: { src: FALLBACK_IMAGE, position }, before: { src: FALLBACK_IMAGE, position } })
  const { shown, before } = layers
  useEffect(() => {
    let active = true
    const image = new Image()
    const commit = () => {
      if (!active) return
      setLayers((old) => ({ before: old.shown, shown: { src: image.src, position } }))
    }
    const candidates = [...new Set([src, fallback, FALLBACK_IMAGE].filter(Boolean))]
    let attempt = 0
    image.onload = commit
    image.onerror = () => { if (active && ++attempt < candidates.length) image.src = candidates[attempt] }
    image.src = candidates[0]
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [src, fallback, position])
  return <div className="absolute inset-0 overflow-hidden" aria-hidden>
    <img src={before.src} alt="" style={{ objectPosition: before.position }} className="absolute inset-0 size-full object-cover opacity-45 [filter:grayscale(.5)_sepia(.35)_blur(1.5px)]" />
    <img key={shown.src} data-scene-image src={shown.src} alt="" style={{ objectPosition: shown.position }} className="anim-drift scene-image-in absolute inset-0 size-full object-cover opacity-45 [filter:grayscale(.5)_sepia(.35)_blur(1.5px)]" />
  </div>
}
