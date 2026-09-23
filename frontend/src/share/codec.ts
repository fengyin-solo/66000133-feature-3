import type { DesignParams, PatternType } from '../types'
import { THEMES } from '../themes/palettes'

/**
 * 作品链接编解码：
 * - 9 个参数以紧凑短键写入 query string，固定字段顺序保证规范化
 * - c 为 FNV-1a 校验码，用于发现参数缺失/损坏/篡改
 * - 校验通过后仍逐字段做类型与范围校验，异常字段回落默认值并给出原因
 */

export const VALID_PATTERNS = ['spiral', 'fractal', 'wave', 'circles', 'noise'] as const

export const PATTERN_META: Record<string, { label: string; emoji: string }> = {
  spiral: { label: '螺旋', emoji: '🌀' },
  fractal: { label: '分形树', emoji: '🌳' },
  wave: { label: '波浪', emoji: '🌊' },
  circles: { label: '圆环', emoji: '⭕' },
  noise: { label: '噪声场', emoji: '🎲' },
}

export interface ArtSettings {
  pattern: PatternType
  seed: number
  iterations: number
  scale: number
  rotation: number
  strokeWidth: number
  opacity: number
  themeId: string
}

export const DEFAULT_SETTINGS: ArtSettings = {
  pattern: 'spiral',
  seed: 42,
  iterations: 200,
  scale: 1,
  rotation: 0,
  strokeWidth: 1.5,
  opacity: 0.8,
  themeId: THEMES[0].id,
}

type FieldKind = 'int' | 'num' | 'pattern' | 'theme'

interface FieldMeta {
  key: keyof ArtSettings
  short: string
  label: string
  kind: FieldKind
  min?: number
  max?: number
}

const FIELDS: FieldMeta[] = [
  { key: 'pattern', short: 'p', label: '图案类型', kind: 'pattern' },
  { key: 'seed', short: 's', label: '种子', kind: 'int', min: 0, max: 99999 },
  { key: 'iterations', short: 'i', label: '迭代数', kind: 'int', min: 10, max: 500 },
  { key: 'scale', short: 'z', label: '缩放', kind: 'num', min: 0.1, max: 3 },
  { key: 'rotation', short: 'r', label: '旋转', kind: 'num', min: 0, max: 360 },
  { key: 'strokeWidth', short: 'w', label: '描边宽度', kind: 'num', min: 0.5, max: 5 },
  { key: 'opacity', short: 'o', label: '透明度', kind: 'num', min: 0.1, max: 1 },
  { key: 'themeId', short: 't', label: '颜色主题', kind: 'theme' },
]

const CHECKSUM_KEY = 'c'
const SHARE_KEYS = new Set([...FIELDS.map(f => f.short), CHECKSUM_KEY])

function fnv1aHex(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 规范化参数对（短键=原始值，固定顺序），校验码与等值比较都基于它 */
function pairsString(values: Record<string, string>): string {
  return FIELDS.map(f => `${f.short}=${values[f.short] ?? ''}`).join('&')
}

/** 把当前作品设置编码成不带前导 ? 的 query string（含校验码） */
export function encodeSettings(s: ArtSettings): string {
  const raw: Record<string, string> = {
    p: s.pattern,
    s: String(s.seed),
    i: String(s.iterations),
    z: String(s.scale),
    r: String(s.rotation),
    w: String(s.strokeWidth),
    o: String(s.opacity),
    t: s.themeId,
  }
  const params = new URLSearchParams()
  for (const f of FIELDS) params.set(f.short, raw[f.short])
  params.set(CHECKSUM_KEY, fnv1aHex(pairsString(raw)))
  return params.toString()
}

export interface DecodeResult {
  /** 地址中是否带任何分享参数（未知参数不计） */
  hasShare: boolean
  /** 校验失败：链接整体不可信，调用方应整体退回默认 */
  fatal: boolean
  /** 可应用的设置；fatal 时为 null，字段级异常时相应位置已回落为默认值 */
  settings: ArtSettings | null
  /** 给用户看的中文原因说明 */
  issues: string[]
}

function defaultText(f: FieldMeta): string {
  const v = DEFAULT_SETTINGS[f.key]
  if (f.kind === 'pattern') return PATTERN_META[String(v)].label
  if (f.kind === 'theme') return THEMES.find(t => t.id === v)?.name ?? String(v)
  return String(v)
}

function validateField(f: FieldMeta, raw: string): { value: string | number; issue?: string } {
  const fallback = (reason: string) => ({
    value: DEFAULT_SETTINGS[f.key] as string | number,
    issue: `链接中的「${f.label}」${reason}，已改用默认值 ${defaultText(f)}`,
  })

  if (f.kind === 'pattern') {
    return (VALID_PATTERNS as readonly string[]).includes(raw)
      ? { value: raw }
      : fallback('无法识别')
  }
  if (f.kind === 'theme') {
    return THEMES.some(t => t.id === raw)
      ? { value: raw }
      : fallback('无法识别')
  }

  const text = raw.trim()
  if (text === '' || /nan|inf/i.test(text)) return fallback('不是有效数字')
  const n = Number(text)
  if (!Number.isFinite(n)) return fallback('不是有效数字')
  if (f.kind === 'int' && !Number.isInteger(n)) return fallback('必须是整数')
  if (f.min !== undefined && n < f.min) return fallback(`超出允许范围（${f.min}–${f.max}）`)
  if (f.max !== undefined && n > f.max) return fallback(`超出允许范围（${f.min}–${f.max}）`)
  return { value: n }
}

/** 解码地址栏 search（带不带 ? 均可） */
export function decodeLocation(rawSearch: string): DecodeResult {
  const search = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch
  const params = new URLSearchParams(search)

  const hasShare = [...SHARE_KEYS].some(k => params.has(k))
  if (!hasShare) return { hasShare: false, fatal: false, settings: null, issues: [] }

  const rawValues: Record<string, string> = {}
  for (const f of FIELDS) rawValues[f.short] = params.get(f.short) ?? ''

  const checksum = (params.get(CHECKSUM_KEY) ?? '').toLowerCase()
  if (!checksum || fnv1aHex(pairsString(rawValues)) !== checksum) {
    return {
      hasShare: true,
      fatal: true,
      settings: null,
      issues: [
        checksum
          ? '分享链接的校验码不匹配，参数可能已被损坏或篡改，已整体恢复为默认作品。'
          : '分享链接缺少校验码，无法确认参数是否完整，已整体恢复为默认作品。',
      ],
    }
  }

  const settings: ArtSettings = { ...DEFAULT_SETTINGS }
  const issues: string[] = []
  for (const f of FIELDS) {
    const raw = rawValues[f.short]
    if (raw === '') {
      issues.push(`链接缺少「${f.label}」参数，已改用默认值 ${defaultText(f)}`)
      continue
    }
    const r = validateField(f, raw)
    ;(settings as Record<keyof ArtSettings, string | number>)[f.key] = r.value
    if (r.issue) issues.push(r.issue)
  }
  return { hasShare: true, fatal: false, settings, issues }
}

/** 从设计器当前状态（含调色板）反查主题 id，得到可编码的设置 */
export function settingsFromDesign(d: DesignParams): ArtSettings {
  const paletteKey = d.palette.join('|')
  const theme = THEMES.find(t => t.colors.join('|') === paletteKey) ?? THEMES[0]
  return {
    pattern: d.pattern,
    seed: d.seed,
    iterations: d.iterations,
    scale: d.scale,
    rotation: d.rotation,
    strokeWidth: d.strokeWidth,
    opacity: d.opacity,
    themeId: theme.id,
  }
}

/** 两份设置是否对应同一张作品（规范化比较） */
export function sameSettings(a: ArtSettings, b: ArtSettings): boolean {
  return encodeSettings(a) === encodeSettings(b)
}

/** 作品的人类可读标题，用于最近打开列表 */
export function describeSettings(s: ArtSettings): string {
  const meta = PATTERN_META[s.pattern] ?? PATTERN_META.spiral
  const themeName = THEMES.find(t => t.id === s.themeId)?.name ?? ''
  return `${meta.emoji} ${meta.label} · ${themeName} · #${s.seed}`
}
