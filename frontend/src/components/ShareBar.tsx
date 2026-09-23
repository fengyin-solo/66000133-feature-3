import { useEffect } from 'react'
import { encodeSettings } from '../share/codec'
import { bootResult, useDesignStore } from '../store/design'
import { useHistoryStore } from '../store/history'
import { useShareStore, writeUrl } from '../store/share'

export default function ShareBar() {
  const status = useShareStore(s => s.status)
  const issues = useShareStore(s => s.issues)
  const toast = useShareStore(s => s.toast)
  const publish = useShareStore(s => s.publish)
  const revert = useShareStore(s => s.revert)

  // 订阅设计参数变化：任何手动修改都要让原链接进入"已过期"状态
  useEffect(() => {
    const reconcile = useShareStore.getState().reconcile
    const unsub = useDesignStore.subscribe(() => reconcile())
    return unsub
  }, [])

  // 首次打开（含刷新）：把地址规范化成与"复制链接"完全一致的编码，并记入最近打开
  useEffect(() => {
    if (bootResult.hasShare && !bootResult.fatal && bootResult.settings) {
      const query = encodeSettings(bootResult.settings)
      writeUrl(query)
      useHistoryStore.getState().touch(query, bootResult.settings)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm min-h-[44px]">
        {status === 'stale' && (
          <div className="flex items-center justify-between gap-3 w-full flex-wrap">
            <span className="text-amber-300">
              ⚠️ 设置已被手动修改，<span className="font-semibold">原分享链接已过期</span>，别人再打开旧链接看到的不是当前画面
            </span>
            <span className="flex gap-2">
              <button onClick={revert} className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600">
                ↩ 放弃修改
              </button>
              <button onClick={publish} className="px-3 py-1 rounded text-xs bg-amber-600 hover:bg-amber-500 font-medium">
                🔗 复制新链接
              </button>
            </span>
          </div>
        )}

        {status === 'invalid' && (
          <div className="flex flex-col gap-0.5 w-full">
            <span className="text-rose-300 font-medium">🚫 作品链接无效，已恢复为默认作品</span>
            {issues.map((it, i) => (
              <span key={i} className="text-rose-400/80 text-xs leading-relaxed">{it}</span>
            ))}
          </div>
        )}

        {status === 'clean' && (
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="text-emerald-300 text-xs">
              ✅ 地址栏链接可复现当前作品，复制发给同事即可复看
            </span>
            <button onClick={publish} className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600">
              🔗 复制链接
            </button>
          </div>
        )}

        {status === 'fresh' && (
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="text-gray-400 text-xs">
              调好参数后点击「复制作品链接」，他人打开即可还原同一张作品
            </span>
            <button onClick={publish} className="px-3 py-1 rounded text-xs bg-indigo-600 hover:bg-indigo-500 font-medium">
              🔗 复制作品链接
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 shadow-xl text-sm">
          {toast}
        </div>
      )}
    </>
  )
}
