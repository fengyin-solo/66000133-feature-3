import { useEffect } from 'react'
import ArtCanvas from './components/ArtCanvas'
import Sidebar from './components/Sidebar'
import { useDesignStore } from './store/design'

const NOTICE_STYLE = {
  error: 'bg-rose-950/90 border-rose-700 text-rose-200',
  info: 'bg-amber-950/90 border-amber-700 text-amber-200',
} as const

const NOTICE_ICON = { repaired: '🛠', tampered: '⚠️', stale: '↻' } as const

export default function App() {
  const hydrateFromLocation = useDesignStore((s) => s.hydrateFromLocation)
  const syncFromLocation = useDesignStore((s) => s.syncFromLocation)
  const notice = useDesignStore((s) => s.notice)
  const dismissNotice = useDesignStore((s) => s.dismissNotice)

  // 首次打开：按地址还原作品（被篡改/越界则回退默认并说明）
  useEffect(() => {
    hydrateFromLocation()
  }, [hydrateFromLocation])

  // 浏览器前进 / 后退：回到地址对应的那一份作品
  useEffect(() => {
    const onPop = () => syncFromLocation()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [syncFromLocation])

  return (
    <div className="flex w-full h-full">
      <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
        {notice && (
          <div
            className={`shrink-0 flex items-start gap-2 px-4 py-2 border-b text-xs leading-relaxed ${NOTICE_STYLE[notice.level]}`}
            role="status"
          >
            <span aria-hidden>{NOTICE_ICON[notice.tag]}</span>
            <span className="flex-1">{notice.text}</span>
            <button
              onClick={dismissNotice}
              className="opacity-70 hover:opacity-100 px-1"
              title="知道了"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <ArtCanvas />
        </div>
      </div>
      <Sidebar />
    </div>
  )
}
