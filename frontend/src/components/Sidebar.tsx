import { useDesignStore } from '../store/design'
import { useShareStore } from '../store/share'
import { useHistoryStore } from '../store/history'
import { THEMES } from '../themes/palettes'
import type { PatternType } from '../types'

const PATTERNS: { value: PatternType; label: string }[] = [
  { value: 'spiral',  label: '🌀 螺旋' },
  { value: 'fractal', label: '🌳 分形树' },
  { value: 'wave',    label: '🌊 波浪' },
  { value: 'circles', label: '⭕ 圆环' },
  { value: 'noise',   label: '🎲 噪声场' },
]

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export default function Sidebar() {
  const store = useDesignStore()
  const shareStatus = useShareStore(s => s.status)
  const publish = useShareStore(s => s.publish)
  const restore = useShareStore(s => s.restore)
  const entries = useHistoryStore(s => s.entries)
  const removeEntry = useHistoryStore(s => s.remove)
  const clearHistory = useHistoryStore(s => s.clear)

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-700 p-4 overflow-y-auto flex flex-col gap-4">
      <h2 className="text-lg font-bold">🎨 SVG 海报设计器</h2>

      {/* Pattern */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">图案类型</label>
        <div className="grid grid-cols-2 gap-2">
          {PATTERNS.map(p => (
            <button key={p.value} onClick={() => store.setPattern(p.value)}
              className={`px-2 py-1.5 rounded text-xs font-medium ${store.pattern===p.value?'bg-indigo-600':'bg-gray-700 hover:bg-gray-600'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">颜色主题</label>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => store.setTheme(t.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600">
              <div className="flex">{t.colors.map((c,i) => (
                <div key={i} style={{background:c}} className="w-3 h-3 rounded-full" />
              ))}</div>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Seed */}
      <div>
        <label className="text-xs text-gray-400">种子: {store.seed}</label>
        <div className="flex gap-2 mt-1">
          <input type="range" min={0} max={99999} value={store.seed}
            onChange={e => store.setParam('seed', Number(e.target.value))} className="flex-1 accent-indigo-500" />
          <button onClick={() => store.randomSeed()} className="px-2 bg-indigo-600 rounded text-xs">🎲</button>
        </div>
      </div>

      {/* Iterations */}
      <div>
        <label className="text-xs text-gray-400">迭代数: {store.iterations}</label>
        <input type="range" min={10} max={500} step={10} value={store.iterations}
          onChange={e => store.setParam('iterations', Number(e.target.value))} className="w-full accent-purple-500" />
      </div>

      {/* Scale */}
      <div>
        <label className="text-xs text-gray-400">缩放: {store.scale.toFixed(2)}</label>
        <input type="range" min={0.1} max={3} step={0.1} value={store.scale}
          onChange={e => store.setParam('scale', Number(e.target.value))} className="w-full accent-green-500" />
      </div>

      {/* Rotation */}
      <div>
        <label className="text-xs text-gray-400">旋转: {store.rotation}°</label>
        <input type="range" min={0} max={360} step={5} value={store.rotation}
          onChange={e => store.setParam('rotation', Number(e.target.value))} className="w-full accent-yellow-500" />
      </div>

      {/* Stroke */}
      <div>
        <label className="text-xs text-gray-400">描边: {store.strokeWidth.toFixed(1)}</label>
        <input type="range" min={0.5} max={5} step={0.5} value={store.strokeWidth}
          onChange={e => store.setParam('strokeWidth', Number(e.target.value))} className="w-full accent-orange-500" />
      </div>

      {/* Opacity */}
      <div>
        <label className="text-xs text-gray-400">透明度: {store.opacity.toFixed(2)}</label>
        <input type="range" min={0.1} max={1} step={0.05} value={store.opacity}
          onChange={e => store.setParam('opacity', Number(e.target.value))} className="w-full accent-pink-500" />
      </div>

      {/* Share */}
      <div className="rounded-lg border border-indigo-700/60 bg-indigo-950/40 p-3 flex flex-col gap-2">
        <div className="text-xs text-gray-300 font-medium">🔗 作品链接</div>
        <button
          onClick={publish}
          className={`w-full py-2 rounded text-sm font-medium ${shareStatus === 'stale' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
          {shareStatus === 'stale' ? '链接已过期 · 复制新链接' : '复制作品链接'}
        </button>
        <p className="text-[11px] leading-relaxed text-gray-400">
          {shareStatus === 'clean'
            ? '地址栏与当前作品一致，同事打开链接即可复现。'
            : shareStatus === 'stale'
              ? '参数已改动，旧链接对应修改前的作品。'
              : '链接会编码当前全部参数与配色，打开即还原作品。'}
        </p>
      </div>

      {/* Export */}
      <div className="flex gap-2">
        <button onClick={() => store.exportSvg()} className="flex-1 py-2 bg-teal-600 rounded text-sm font-medium">⬇ SVG</button>
        <button onClick={() => store.exportPng()} className="flex-1 py-2 bg-rose-600 rounded text-sm font-medium">⬇ PNG</button>
      </div>

      {/* Recent */}
      <div className="border-t border-gray-700 pt-3 mt-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">🕘 最近打开</span>
          {entries.length > 0 && (
            <button onClick={clearHistory} className="text-[11px] text-gray-500 hover:text-rose-400">清空</button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="rounded border border-dashed border-gray-700 px-3 py-4 text-center">
            <div className="text-2xl mb-1">🗂️</div>
            <p className="text-xs text-gray-500 leading-relaxed">
              还没有作品记录。<br />
              复制并打开一条作品链接后，会在这里列出，方便一键回到最近看过的作品。
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map(e => (
              <li key={e.query}>
                <div className="group flex items-center gap-1 rounded px-2 py-1.5 bg-gray-800 hover:bg-gray-700">
                  <button
                    onClick={() => restore(e.query)}
                    className="flex-1 text-left min-w-0"
                    title="点击恢复该作品">
                    <div className="text-xs truncate">{e.title}</div>
                    <div className="text-[10px] text-gray-500">{relativeTime(e.openedAt)}</div>
                  </button>
                  <button
                    onClick={() => removeEntry(e.query)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 text-xs px-1"
                    title="删除这条记录">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
