import { create } from 'zustand'
import type { DesignParams, PatternType } from '../types'
import { THEMES } from '../themes/palettes'
import { decodeLocation, DEFAULT_SETTINGS, type ArtSettings, type DecodeResult } from '../share/codec'

/** 模块加载时解码一次地址栏，供设计 store 与分享 store 共用同一份结论 */
export const bootResult: DecodeResult = decodeLocation(window.location.search)

export function applySettings(d: ArtSettings): Pick<DesignParams, 'pattern' | 'seed' | 'iterations' | 'scale' | 'rotation' | 'strokeWidth' | 'opacity' | 'palette'> {
  const theme = THEMES.find(t => t.id === d.themeId) ?? THEMES[0]
  return {
    pattern: d.pattern,
    seed: d.seed,
    iterations: d.iterations,
    scale: d.scale,
    rotation: d.rotation,
    strokeWidth: d.strokeWidth,
    opacity: d.opacity,
    palette: theme.colors,
  }
}

const initial: ArtSettings = bootResult.settings ?? DEFAULT_SETTINGS
const initialApplied = applySettings(initial)

interface DesignStore extends DesignParams {
  svgContent: string
  setParam: <K extends keyof DesignParams>(key: K, value: DesignParams[K]) => void
  setPattern: (p: PatternType) => void
  setTheme: (id: string) => void
  randomSeed: () => void
  replaceSettings: (s: ArtSettings) => void
  setSvgContent: (s: string) => void
  exportSvg: () => void
  exportPng: () => void
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  pattern: initialApplied.pattern,
  seed: initialApplied.seed,
  iterations: initialApplied.iterations,
  scale: initialApplied.scale,
  rotation: initialApplied.rotation,
  strokeWidth: initialApplied.strokeWidth,
  opacity: initialApplied.opacity,
  bgColor: '#030712',
  palette: initialApplied.palette,
  width: 800,
  height: 1000,
  svgContent: '',
  setParam: (key, value) => set({ [key]: value } as any),
  setPattern: (p) => set({ pattern: p }),
  setTheme: (id) => {
    const theme = THEMES.find(t => t.id === id)
    if (theme) set({ palette: theme.colors })
  },
  randomSeed: () => set({ seed: Math.floor(Math.random() * 99999) }),
  replaceSettings: (s) => set(applySettings(s)),
  setSvgContent: (s) => set({ svgContent: s }),
  exportSvg: () => {
    const { svgContent } = get()
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `art-${get().seed}.svg`; a.click()
    URL.revokeObjectURL(url)
  },
  exportPng: () => {
    const { svgContent, width, height } = get()
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob!)
        a.download = `art-${get().seed}.png`; a.click()
      })
    }
    img.src = url
  },
}))
