import { useState } from 'react'
import { useDesignStore } from '../store/design'
import type { RecentEntry } from '../lib/share'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

const STATUS_META = {
  clean: { dot: 'bg-emerald-400', text: '链接与当前画面一致，复制即可还原这张作品。', cls: 'text-emerald-300' },
  stale: { dot: 'bg-amber-400', text: '设置已被手动修改，原链接已过期。重新复制后再发给同事。', cls: 'text-amber-300' },
  default: { dot: 'bg-gray-400', text: '当前是默认作品，复制链接即可把当前设置发给同事。', cls: 'text-gray-400' },
} as const

export default function SharePanel() {
  const linkStatus = useDesignStore((s) => s.linkStatus)
  const recentEntries = useDesignStore((s) => s.recentEntries)
  const buildShareLink = useDesignStore((s) => s.buildShareLink)
  const openRecent = useDesignStore((s) => s.openRecent)
  const deleteRecent = useDesignStore((s) => s.deleteRecent)
  const clearRecent = useDesignStore((s) => s.clearRecent)

  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = buildShareLink()
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ok = document.execCommand('copy')
      document.body.removeChild(ta)
    }
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  const meta = STATUS_META[linkStatus]

  return (
    <div className="border-t border-gray-700 pt-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold">🔗 分享与复原</h3>

      <button
        onClick={handleCopy}
        className={`w-full py-2 rounded text-sm font-medium ${
          copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500'
        }`}
      >
        {copied ? '✓ 已复制，可直接粘贴' : '复制作品链接'}
      </button>

      <p className={`text-[11px] leading-relaxed flex items-start gap-1.5 ${meta.cls}`}>
        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
        {copied ? '链接已复制到剪贴板，在任意机器打开都会还原这一张。' : meta.text}
      </p>

      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">最近打开过的作品</label>
        {recentEntries.length > 0 && (
          <button onClick={clearRecent} className="text-[11px] text-gray-500 hover:text-rose-400">
            清空
          </button>
        )}
      </div>

      {recentEntries.length === 0 ? (
        <div className="rounded border border-dashed border-gray-700 px-3 py-4 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            还没有打开过任何作品链接。
          </p>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            复制上方链接发给同事，或在地址栏打开一个作品链接，最近打开的作品会出现在这里，方便一键回到。
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
          {recentEntries.map((entry: RecentEntry) => (
            <li
              key={entry.id}
              className="group flex items-center gap-1 rounded bg-gray-800 hover:bg-gray-700 pr-1"
            >
              <button
                onClick={() => openRecent(entry)}
                className="flex-1 min-w-0 text-left px-2 py-1.5"
                title={entry.title}
              >
                <span className="block text-[11px] truncate">{entry.title}</span>
                <span className="block text-[10px] text-gray-500">{relativeTime(entry.openedAt)}</span>
              </button>
              <button
                onClick={() => deleteRecent(entry.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 text-xs px-1.5"
                title="移除该记录"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
