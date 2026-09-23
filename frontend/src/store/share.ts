import { create } from 'zustand'
import {
  decodeLocation,
  encodeSettings,
  sameSettings,
  settingsFromDesign,
  type ArtSettings,
} from '../share/codec'
import { applySettings, bootResult, useDesignStore } from './design'
import { useHistoryStore } from './history'

/**
 * 作品分享链路状态机：
 * - fresh   地址栏没有作品参数（默认起始画面），复制链接后转为 clean
 * - clean   画面与地址栏链接完全一致，链接可复现当前作品
 * - stale   用户在链接作品基础上改过设置，原链接已过期，需要重新复制
 * - invalid 打开的链接损坏/篡改，已整体退回默认作品并说明原因
 */
export type ShareStatus = 'fresh' | 'clean' | 'stale' | 'invalid'

interface ShareStore {
  status: ShareStatus
  issues: string[]
  /** 地址栏链接对应的那组设置；fresh/invalid 时为 null */
  published: ArtSettings | null
  toast: string | null
  showToast: (msg: string) => void
  /** 发布当前作品：地址栏、历史记录与复制出去的链接保持同一份编码 */
  publish: () => string
  /** 从最近打开列表恢复一条记录 */
  restore: (query: string) => boolean
  /** 设置被手动修改后调用，根据与已发布快照的差异切换过期状态 */
  reconcile: () => void
  /** 放弃手动修改，回到地址栏链接对应的作品 */
  revert: () => void
}

export function writeUrl(query: string) {
  const url = new URL(window.location.href)
  if (query) url.search = query
  else url.search = ''
  window.history.replaceState(null, '', url)
}

export function buildShareUrl(query: string): string {
  const url = new URL(window.location.href)
  url.search = query
  return url.toString()
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 非安全上下文等情况下走兜底
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

const initialStatus: ShareStatus = bootResult.hasShare
  ? bootResult.fatal
    ? 'invalid'
    : 'clean'
  : 'fresh'

const initialPublished = bootResult.settings

export const useShareStore = create<ShareStore>((set, get) => ({
  status: initialStatus,
  issues: bootResult.issues,
  published: initialPublished,
  toast: null,
  showToast: (msg) => {
    set({ toast: msg })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 2500)
  },
  publish: () => {
    const current = settingsFromDesign(useDesignStore.getState())
    const query = encodeSettings(current)
    writeUrl(query)
    useHistoryStore.getState().touch(query, current)
    set({ status: 'clean', published: current, issues: [] })
    const url = buildShareUrl(query)
    copyText(url).then(ok => {
      get().showToast(ok ? '🔗 作品链接已复制，他人打开即可复现' : '链接已更新到地址栏，请手动复制')
    })
    return url
  },
  restore: (query) => {
    const dec = decodeLocation(query)
    if (dec.fatal || !dec.settings) {
      get().showToast('该记录已损坏，无法恢复')
      return false
    }
    useDesignStore.getState().replaceSettings(dec.settings)
    writeUrl(query)
    useHistoryStore.getState().touch(query, dec.settings)
    set({ status: 'clean', published: dec.settings, issues: dec.issues })
    get().showToast('已恢复到该作品')
    return true
  },
  reconcile: () => {
    const { status, published } = get()
    if (status !== 'clean' || !published) return
    const current = settingsFromDesign(useDesignStore.getState())
    if (!sameSettings(current, published)) set({ status: 'stale' })
  },
  revert: () => {
    const { published, status } = get()
    if (!published || (status !== 'stale')) return
    useDesignStore.setState(applySettings(published))
    set({ status: 'clean' })
  },
}))
