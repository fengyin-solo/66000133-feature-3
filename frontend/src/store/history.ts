import { create } from 'zustand'
import { decodeLocation, describeSettings, encodeSettings, type ArtSettings } from '../share/codec'

/**
 * 最近打开过的作品记录，持久化在 localStorage。
 * 条目以规范化 query（含校验码）去重，最新在最前，封顶 MAX_ITEMS 条。
 */

export interface HistoryEntry {
  query: string
  title: string
  openedAt: number
}

const STORAGE_KEY = 'generative-art.history.v1'
const MAX_ITEMS = 12

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const seen = new Set<string>()
    const out: HistoryEntry[] = []
    for (const item of data) {
      if (!item || typeof item.query !== 'string' || typeof item.openedAt !== 'number') continue
      // 打开时再验证一次：已损坏的旧记录不再列出；统一规范化后按编码去重
      const dec = decodeLocation(item.query)
      if (dec.fatal || !dec.settings) continue
      const query = encodeSettings(dec.settings)
      if (seen.has(query)) continue
      seen.add(query)
      out.push({ query, title: item.title || describeSettings(dec.settings), openedAt: item.openedAt })
      if (out.length >= MAX_ITEMS) break
    }
    return out
  } catch {
    return []
  }
}

interface HistoryStore {
  entries: HistoryEntry[]
  /** 打开一条作品链接时记录（含首次从地址栏还原、从列表恢复、复制发布） */
  touch: (query: string, settings?: ArtSettings) => void
  remove: (query: string) => void
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  entries: load(),
  touch: (query, settings) => {
    const dec = decodeLocation(query)
    if (dec.fatal || !dec.settings) return
    const resolved = settings ?? dec.settings
    const canonical = encodeSettings(resolved)
    const title = describeSettings(resolved)
    const entry: HistoryEntry = { query: canonical, title, openedAt: Date.now() }
    const rest = get().entries.filter(e => e.query !== canonical)
    const entries = [entry, ...rest].slice(0, MAX_ITEMS)
    set({ entries })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // 存储不可用时仅保留在内存中
    }
  },
  remove: (query) => {
    const entries = get().entries.filter(e => e.query !== query)
    set({ entries })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // ignore
    }
  },
  clear: () => {
    set({ entries: [] })
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  },
}))
