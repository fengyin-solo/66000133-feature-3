import type { DesignParams, PatternType } from '../types'
import { THEMES } from '../themes/palettes'

/* ------------------------------------------------------------------ */
/* 默认作品                                                             */
/* ------------------------------------------------------------------ */

export const DEFAULT_PARAMS: DesignParams = {
  pattern: 'spiral',
  seed: 42,
  iterations: 200,
  scale: 1,
  rotation: 0,
  strokeWidth: 1.5,
  opacity: 0.8,
  bgColor: '#030712',
  palette: THEMES[0].colors.slice(),
  width: 800,
  height: 1000,
}

export function cloneDefaults(): DesignParams {
  return { ...DEFAULT_PARAMS, palette: DEFAULT_PARAMS.palette.slice() }
}

export const PATTERN_LABELS: Record<PatternType, string> = {
  spiral: '螺旋',
  fractal: '分形树',
  wave: '波浪',
  circles: '圆环',
  noise: '噪声场',
  voronoi: '泰森多边形',
}

// 可以实际渲染的图案（voronoi 只有类型没有生成器，不接受）
const RENDERABLE_PATTERNS: PatternType[] = ['spiral', 'fractal', 'wave', 'circles', 'noise']

export const RANGES = {
  seed: { min: 0, max: 99999 },
  iterations: { min: 10, max: 500 },
  scale: { min: 0.1, max: 3 },
  rotation: { min: 0, max: 360 },
  strokeWidth: { min: 0.5, max: 5 },
  opacity: { min: 0.1, max: 1 },
  width: { min: 200, max: 4000 },
  height: { min: 200, max: 4000 },
}

const HEX_RE = /^#[0-9a-f]{6}$/i
const MAX_PALETTE = 12

/* ------------------------------------------------------------------ */
/* 编码：参数 -> 地址查询串                                              */
/* ------------------------------------------------------------------ */

// 查询串里使用的短键名
const QK = {
  version: 'v',
  pattern: 'p',
  theme: 'th',
  palette: 'pl',
  seed: 'seed',
  iterations: 'it',
  scale: 'sc',
  rotation: 'rot',
  stroke: 'sw',
  opacity: 'op',
  bg: 'bg',
  width: 'w',
  height: 'h',
  checksum: 'c',
} as const

type Record_ = Record<string, string>

export function findThemeByPalette(colors: string[]): (typeof THEMES)[number] | undefined {
  return THEMES.find(
    (t) => t.colors.length === colors.length && t.colors.every((c, i) => c.toLowerCase() === colors[i].toLowerCase())
  )
}

function trimNum(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function paramsToRecord(p: DesignParams): Record_ {
  const r: Record_ = {
    [QK.version]: '1',
    [QK.pattern]: p.pattern,
    [QK.seed]: String(p.seed),
    [QK.iterations]: String(p.iterations),
    [QK.scale]: trimNum(p.scale),
    [QK.rotation]: trimNum(p.rotation),
    [QK.stroke]: trimNum(p.strokeWidth),
    [QK.opacity]: trimNum(p.opacity),
    [QK.bg]: p.bgColor.toLowerCase(),
    [QK.width]: String(p.width),
    [QK.height]: String(p.height),
  }
  const theme = findThemeByPalette(p.palette)
  if (theme) {
    r[QK.theme] = theme.id
  } else {
    r[QK.palette] = p.palette.map((c) => c.replace('#', '').toLowerCase()).join(',')
  }
  return r
}

function canonical(r: Record_): string {
  return Object.keys(r)
    .sort()
    .map((k) => `${k}=${r[k]}`)
    .join('&')
}

/** 参数的稳定指纹：等价参数永远得到相同指纹（用于过期判断与最近记录去重） */
export function signatureOf(p: DesignParams): string {
  return hash(canonical(paramsToRecord(p)))
}

// FNV-1a 32 位校验和
function hash(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8)
}

/** 把当前作品编码成完整链接（复制出去的就是这个） */
export function buildShareUrl(p: DesignParams): string {
  const rec = paramsToRecord(p)
  const usp = new URLSearchParams()
  usp.set('art', '1')
  for (const [k, v] of Object.entries(rec)) usp.set(k, v)
  usp.set(QK.checksum, hash(canonical(rec)))
  const { origin, pathname } = window.location
  return `${origin}${pathname}?${usp.toString()}`
}

/* ------------------------------------------------------------------ */
/* 解码：地址查询串 -> 参数（严格校验，缺失/越界/篡改均回退默认）           */
/* ------------------------------------------------------------------ */

export interface ShareParseResult {
  /** 地址里是否携带作品链接（art=1） */
  active: boolean
  /** 校验和不通过：整条链接视为被篡改，整体回退默认 */
  tampered: boolean
  params: DesignParams | null
  /** 回退/修复说明，逐条给出原因 */
  issues: string[]
  /** 解析后参数的指纹（篡改时为默认参数指纹） */
  signature: string | null
}

interface NumSpec {
  qk: string
  label: string
  min: number
  max: number
  integer: boolean
  dft: number
  dftText: string
}

const NUM_SPECS: NumSpec[] = [
  { qk: QK.seed, label: '种子', min: RANGES.seed.min, max: RANGES.seed.max, integer: true, dft: DEFAULT_PARAMS.seed, dftText: String(DEFAULT_PARAMS.seed) },
  { qk: QK.iterations, label: '迭代数', min: RANGES.iterations.min, max: RANGES.iterations.max, integer: true, dft: DEFAULT_PARAMS.iterations, dftText: String(DEFAULT_PARAMS.iterations) },
  { qk: QK.scale, label: '缩放', min: RANGES.scale.min, max: RANGES.scale.max, integer: false, dft: DEFAULT_PARAMS.scale, dftText: String(DEFAULT_PARAMS.scale) },
  { qk: QK.rotation, label: '旋转', min: RANGES.rotation.min, max: RANGES.rotation.max, integer: false, dft: DEFAULT_PARAMS.rotation, dftText: '0°' },
  { qk: QK.stroke, label: '描边宽度', min: RANGES.strokeWidth.min, max: RANGES.strokeWidth.max, integer: false, dft: DEFAULT_PARAMS.strokeWidth, dftText: String(DEFAULT_PARAMS.strokeWidth) },
  { qk: QK.opacity, label: '透明度', min: RANGES.opacity.min, max: RANGES.opacity.max, integer: false, dft: DEFAULT_PARAMS.opacity, dftText: String(DEFAULT_PARAMS.opacity) },
  { qk: QK.width, label: '画布宽度', min: RANGES.width.min, max: RANGES.width.max, integer: true, dft: DEFAULT_PARAMS.width, dftText: String(DEFAULT_PARAMS.width) },
  { qk: QK.height, label: '画布高度', min: RANGES.height.min, max: RANGES.height.max, integer: true, dft: DEFAULT_PARAMS.height, dftText: String(DEFAULT_PARAMS.height) },
]

function resolveNum(raw: Record_, spec: NumSpec, out: Record<string, number>, issues: string[]) {
  const v = raw[spec.qk]
  if (v === undefined) {
    issues.push(`链接缺少“${spec.label}”，已使用默认值（${spec.dftText}）。`)
    out[spec.qk] = spec.dft
    return
  }
  const n = Number(v)
  if (v.trim() === '' || !Number.isFinite(n) || (spec.integer && !Number.isInteger(n))) {
    issues.push(`“${spec.label}”的值无效，已恢复默认（${spec.dftText}）。`)
    out[spec.qk] = spec.dft
    return
  }
  if (n < spec.min || n > spec.max) {
    issues.push(`“${spec.label}”超出允许范围（${spec.min}~${spec.max}），已恢复默认（${spec.dftText}）。`)
    out[spec.qk] = spec.dft
    return
  }
  out[spec.qk] = n
}

export function parseShare(search: string): ShareParseResult {
  const inactive: ShareParseResult = { active: false, tampered: false, params: null, issues: [], signature: null }
  if (!search) return inactive

  const usp = new URLSearchParams(search)
  if (usp.get('art') !== '1') return inactive

  // 取出参与校验的原始键值（art / c 除外；重复键只认第一个）
  const raw: Record_ = {}
  for (const [k, v] of usp) {
    if (k !== 'art' && k !== QK.checksum && !(k in raw)) raw[k] = v
  }

  const c = usp.get(QK.checksum)
  if (!c || !/^[0-9a-f]{8}$/.test(c) || hash(canonical(raw)) !== c.toLowerCase()) {
    return {
      active: true,
      tampered: true,
      params: cloneDefaults(),
      issues: ['链接校验未通过：参数可能已损坏或被篡改，已整体恢复为默认作品。'],
      signature: signatureOf(DEFAULT_PARAMS),
    }
  }

  const issues: string[] = []
  const resolved = cloneDefaults()

  // 图案
  {
    const v = raw[QK.pattern]
    if (v === undefined) {
      issues.push('链接缺少“图案类型”，已使用默认值（螺旋）。')
    } else if (!RENDERABLE_PATTERNS.includes(v as PatternType)) {
      issues.push(`“图案类型”无法识别（${v}），已恢复默认（螺旋）。`)
    } else {
      resolved.pattern = v as PatternType
    }
  }

  // 数值参数
  const nums: Record<string, number> = {}
  for (const spec of NUM_SPECS) resolveNum(raw, spec, nums, issues)
  resolved.seed = nums[QK.seed]
  resolved.iterations = nums[QK.iterations]
  resolved.scale = nums[QK.scale]
  resolved.rotation = nums[QK.rotation]
  resolved.strokeWidth = nums[QK.stroke]
  resolved.opacity = nums[QK.opacity]
  resolved.width = nums[QK.width]
  resolved.height = nums[QK.height]

  // 背景色
  {
    const v = raw[QK.bg]
    if (v === undefined) {
      issues.push('链接缺少“背景色”，已使用默认值。')
    } else if (!HEX_RE.test(v)) {
      issues.push('“背景色”不是合法的 #rrggbb 颜色，已恢复默认。')
    } else {
      resolved.bgColor = v.toLowerCase()
    }
  }

  // 配色：主题优先，其次自定义色板
  {
    const th = raw[QK.theme]
    const pl = raw[QK.palette]
    if (th !== undefined) {
      const theme = THEMES.find((t) => t.id === th)
      if (theme) {
        resolved.palette = theme.colors.slice()
      } else {
        issues.push(`颜色主题“${th}”无法识别，已恢复默认（日落）。`)
      }
    } else if (pl !== undefined) {
      const colors = pl.split(',').map((s) => s.trim())
      if (colors.length < 1 || colors.length > MAX_PALETTE || !colors.every((c) => HEX_RE.test('#' + c))) {
        issues.push('自定义配色格式无效，已恢复默认（日落）。')
      } else {
        resolved.palette = colors.map((c) => '#' + c.toLowerCase())
      }
    } else {
      issues.push('链接缺少配色信息，已使用默认主题（日落）。')
    }
  }

  return { active: true, tampered: false, params: resolved, issues, signature: signatureOf(resolved) }
}

/* ------------------------------------------------------------------ */
/* 最近打开记录（localStorage）                                          */
/* ------------------------------------------------------------------ */

export interface RecentEntry {
  id: string
  signature: string
  url: string
  title: string
  seed: number
  openedAt: number
}

const STORAGE_KEY = 'generative-art:recent:v1'
const RECENT_LIMIT = 10

export function loadRecentEntries(): RecentEntry[] {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY)
    if (!text) return []
    const arr = JSON.parse(text)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (e): e is RecentEntry =>
        e && typeof e.id === 'string' && typeof e.url === 'string' && typeof e.openedAt === 'number'
    )
  } catch {
    return []
  }
}

function saveRecentEntries(entries: RecentEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 隐私模式等场景下降级为不持久化，不影响主流程
  }
}

function titleOf(p: DesignParams): string {
  const theme = findThemeByPalette(p.palette)
  return `${PATTERN_LABELS[p.pattern]} · ${theme ? theme.name : '自定义配色'} · 种子 ${p.seed}`
}

/** 记录一次成功打开（修复后可渲染也算成功；篡改回退不计入），按指纹去重并置顶 */
export function addRecentEntry(p: DesignParams, signature: string): RecentEntry[] {
  const entry: RecentEntry = {
    id: signature,
    signature,
    url: buildShareUrl(p),
    title: titleOf(p),
    seed: p.seed,
    openedAt: Date.now(),
  }
  const entries = [entry, ...loadRecentEntries().filter((e) => e.signature !== signature)].slice(0, RECENT_LIMIT)
  saveRecentEntries(entries)
  return entries
}

export function removeRecentEntry(id: string): RecentEntry[] {
  const entries = loadRecentEntries().filter((e) => e.id !== id)
  saveRecentEntries(entries)
  return entries
}

export function clearRecentEntries(): RecentEntry[] {
  saveRecentEntries([])
  return []
}
