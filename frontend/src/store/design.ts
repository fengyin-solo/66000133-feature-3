import { create } from 'zustand'
import type { DesignParams, PatternType } from '../types'
import { THEMES } from '../themes/palettes'
import {
  addRecentEntry,
  buildShareUrl,
  clearRecentEntries,
  cloneDefaults,
  loadRecentEntries,
  parseShare,
  removeRecentEntry,
  signatureOf,
  type RecentEntry,
} from '../lib/share'

export type LinkStatus = 'clean' | 'default' | 'stale'

export interface LinkNotice {
  level: 'error' | 'info'
  tag: 'repaired' | 'tampered' | 'stale'
  text: string
}

interface DesignStore extends DesignParams {
  svgContent: string

  // ---- 可复原链路状态 ----
  /** 地址是否已从链接初始化（避免 StrictMode 双调用） */
  hydrated: boolean
  /** 最近一次从链接加载 / 复制出去的作品指纹；从未分享过则为 null */
  lastSharedSignature: string | null
  /** 链接状态：clean=画面与链接一致；default=从未打开/复制过链接；stale=链接已被手动改动 */
  linkStatus: LinkStatus
  /** 顶部横幅说明（篡改 / 修复 / 过期），null 表示无 */
  notice: LinkNotice | null
  /** 最近打开过的作品 */
  recentEntries: RecentEntry[]

  setParam: <K extends keyof DesignParams>(key: K, value: DesignParams[K]) => void
  setPattern: (p: PatternType) => void
  setTheme: (id: string) => void
  randomSeed: () => void
  setSvgContent: (s: string) => void
  exportSvg: () => void
  exportPng: () => void

  hydrateFromLocation: () => void
  syncFromLocation: () => void
  buildShareLink: () => string
  openRecent: (entry: RecentEntry) => void
  deleteRecent: (id: string) => void
  clearRecent: () => void
  dismissNotice: () => void
}

/** 从未打开/复制过链接 -> default；画面与最近链接一致 -> clean；否则 -> stale */
function statusFor(sharedSig: string | null, curSig: string): LinkStatus {
  if (sharedSig === null) return 'default'
  return sharedSig === curSig ? 'clean' : 'stale'
}

function currentParams(get: () => DesignStore): DesignParams {
  const s = get()
  return {
    pattern: s.pattern, seed: s.seed, iterations: s.iterations, scale: s.scale,
    rotation: s.rotation, strokeWidth: s.strokeWidth, opacity: s.opacity,
    bgColor: s.bgColor, palette: s.palette, width: s.width, height: s.height,
  }
}

/** 手动改动后：同步地址栏（保证刷新一致），并把原链接标记为已过期 */
function commitChange(
  set: (partial: Partial<DesignStore>) => void,
  get: () => DesignStore,
  patch: Partial<DesignParams>
) {
  const next = { ...currentParams(get), ...patch }
  // 地址栏始终跟随画面：刷新后地址里的作品就是当前画面
  window.history.replaceState(window.history.state, '', buildShareUrl(next))

  const sig = signatureOf(next)
  const sharedSig = get().lastSharedSignature
  const status = statusFor(sharedSig, sig)

  const notice: LinkNotice | null =
    status === 'stale'
      ? {
          level: 'info',
          tag: 'stale',
          text: '设置已手动修改，原链接已过期——画布上的画面与链接不再相同。需要分享请重新复制链接。',
        }
      : null

  set({ ...patch, linkStatus: status, notice })
}

/** 从地址读取并应用（mode=push 用于“回到某份作品”，replace 用于首次加载/浏览器前进后退） */
function ingest(
  set: (partial: Partial<DesignStore>) => void,
  search: string,
  mode: 'push' | 'replace'
) {
  const result = parseShare(search)
  const navigate = (url: string) => {
    if (mode === 'push') window.history.pushState(window.history.state, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }

  // 无链接 / 链接被篡改：回到无参数的干净地址 + 默认作品（篡改时说明原因）
  if (!result.active || result.tampered) {
    const dft = cloneDefaults()
    navigate(`${window.location.origin}${window.location.pathname}`)
    set({
      ...dft,
      lastSharedSignature: null,
      linkStatus: 'default',
      notice: result.tampered
        ? { level: 'error', tag: 'tampered', text: result.issues.join('') }
        : null,
    })
    return
  }

  // 合法链接（可能含被修复的字段）：地址规范化为修复后的精确参数
  const p = result.params!
  const sig = result.signature!
  navigate(buildShareUrl(p))

  const recentEntries = addRecentEntry(p, sig)
  set({
    ...p,
    lastSharedSignature: sig,
    linkStatus: 'clean',
    notice:
      result.issues.length > 0
        ? {
            level: 'error',
            tag: 'repaired',
            text: '链接参数不完整或超出范围，已逐项恢复默认并打开：' + result.issues.join(' '),
          }
        : null,
    recentEntries,
  })
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  ...cloneDefaults(),
  svgContent: '',

  hydrated: false,
  lastSharedSignature: null,
  linkStatus: 'default',
  notice: null,
  recentEntries: loadRecentEntries(),

  setParam: (key, value) => commitChange(set, get, { [key]: value } as Partial<DesignParams>),
  setPattern: (p) => commitChange(set, get, { pattern: p }),
  setTheme: (id) => {
    const theme = THEMES.find((t) => t.id === id)
    if (theme) commitChange(set, get, { palette: theme.colors.slice() })
  },
  randomSeed: () => commitChange(set, get, { seed: Math.floor(Math.random() * 99999) }),
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

  hydrateFromLocation: () => {
    if (get().hydrated) return
    set({ hydrated: true })
    ingest(set, window.location.search, 'replace')
  },

  syncFromLocation: () => ingest(set, window.location.search, 'replace'),

  buildShareLink: () => {
    const params = currentParams(get)
    const url = buildShareUrl(params)
    const sig = signatureOf(params)
    // 复制即“以此刻画面为准”：地址、基准指纹、状态全部对齐
    window.history.replaceState(window.history.state, '', url)
    set({ lastSharedSignature: sig, linkStatus: 'clean', notice: null })
    return url
  },

  openRecent: (entry) => {
    let search = ''
    try {
      search = new URL(entry.url, window.location.origin).search
    } catch {
      search = ''
    }
    ingest(set, search, 'push')
  },

  deleteRecent: (id) => set({ recentEntries: removeRecentEntry(id) }),
  clearRecent: () => set({ recentEntries: clearRecentEntries() }),
  dismissNotice: () => set({ notice: null }),
}))
