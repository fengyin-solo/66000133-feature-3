import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { rmSync } from 'node:fs'

// ---- 极简浏览器环境垫片 ----
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}
let currentUrl = 'http://localhost:5173/'
let counter = 0
globalThis.window = {
  get location() { return new URL(currentUrl) },
  history: { replaceState: (_s, _t, u) => { currentUrl = String(u) } },
}
globalThis.history = globalThis.window.history
globalThis.document = {
  createElement: () => ({ style: {}, select() {}, remove() {} }),
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
}
globalThis.navigator = {}

let passed = 0, failed = 0
const assert = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✅', name) } else { failed++; console.log('  ❌', name, extra ?? '') }
}

const ENTRY = `
export { useShareStore } from './src/store/share';
export { useDesignStore, bootResult } from './src/store/design';
export { useHistoryStore } from './src/store/history';
export * from './src/share/codec';
`

async function loadFreshBundle(tag, search) {
  currentUrl = 'http://localhost:5173/' + search
  const out = `/tmp/full-${tag}-${counter++}.mjs`
  await build({
    stdin: { contents: ENTRY, resolveDir: '/workspace/frontend', loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node',
    outfile: out, logLevel: 'silent',
  })
  return import(pathToFileURL(out).href)
}

// === 场景 1：全新打开 → 改参数不"过期" → 发布 → 再改 → 过期 → 还原 ===
let m = await loadFreshBundle('s1', '')
{
  const sh = m.useShareStore.getState()
  const ds = m.useDesignStore.getState()
  assert('全新打开 status=fresh', sh.status === 'fresh')
  assert('默认作品 seed=42 / spiral', ds.seed === 42 && ds.pattern === 'spiral')

  m.useDesignStore.getState().setParam('seed', 777)
  m.useShareStore.getState().reconcile()
  assert('fresh 下改参数不会误报链接过期', m.useShareStore.getState().status === 'fresh')

  const url = m.useShareStore.getState().publish()
  assert('发布后 status=clean', m.useShareStore.getState().status === 'clean')
  assert('地址栏已更新为作品链接', currentUrl.includes('s=777') && currentUrl.includes('c='))
  assert('复制出去的链接 === 地址栏链接', url === currentUrl)
  assert('历史记录 1 条', m.useHistoryStore.getState().entries.length === 1)
  assert('历史标题含 #777', m.useHistoryStore.getState().entries[0].title.includes('#777'))

  // 连发两次同作品 → 去重
  m.useShareStore.getState().publish()
  assert('重复发布去重', m.useHistoryStore.getState().entries.length === 1)

  m.useDesignStore.getState().setParam('seed', 888)
  m.useShareStore.getState().reconcile()
  assert('发布后改参数 → stale（原链接已过期）', m.useShareStore.getState().status === 'stale')

  m.useShareStore.getState().revert()
  assert('放弃修改 → status=clean', m.useShareStore.getState().status === 'clean')
  assert('放弃修改 → 画面回到链接作品 seed=777', m.useDesignStore.getState().seed === 777)
  assert('地址栏仍是原链接（不是错版）', currentUrl.includes('s=777') && !currentUrl.includes('s=888'))
}

// === 场景 2：同事/刷新打开复制出去的链接，必须还原同一张 ===
const sharedQuery = currentUrl.split('?')[1]
m = await loadFreshBundle('s2', '?' + sharedQuery)
{
  assert('打开链接 status=clean', m.useShareStore.getState().status === 'clean')
  assert('打开即还原 seed=777', m.useDesignStore.getState().seed === 777)
  assert('打开即还原调色板（5 色）', m.useDesignStore.getState().palette.length === 5)
  assert('同一链接重复打开，历史去重仍 1 条', m.useHistoryStore.getState().entries.length === 1)

  // ShareBar boot effect 的规范化写回
  const canon = m.encodeSettings(m.bootResult.settings)
  assert('刷新规范化后的地址 query === 复制出去的 query', canon === sharedQuery)
}

// === 场景 3：篡改链接 → invalid + 默认作品 + 原因，不入历史 ===
{
  const u = new URL('http://localhost:5173/?' + sharedQuery)
  u.searchParams.set('s', '1')
  m = await loadFreshBundle('s3', u.search)
  assert('篡改链接 → status=invalid', m.useShareStore.getState().status === 'invalid')
  assert('画面是默认作品 seed=42，而非错版画面', m.useDesignStore.getState().seed === 42)
  assert('原因说明提到校验码', m.useShareStore.getState().issues.some(i => i.includes('校验码')))
  assert('篡改链接不写入历史', !m.useHistoryStore.getState().entries.some(e => e.query.startsWith('p=spiral&s=1&')))
}

// === 场景 4：越界但哈希自洽的链接 → 字段级回落 + 原因，仍可打开（非 fatal） ===
{
  const base = { p: 'wave', s: '999999', i: '320', z: '1.7', r: '90', w: '2.5', o: '0.65', t: 'neon' }
  const str = ['p', 's', 'i', 'z', 'r', 'w', 'o', 't'].map(k => `${k}=${base[k]}`).join('&')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  const usp = new URLSearchParams(base); usp.set('c', (h >>> 0).toString(16).padStart(8, '0'))
  m = await loadFreshBundle('s4', '?' + usp.toString())
  assert('越界但哈希自洽 → status=clean（可正常打开）', m.useShareStore.getState().status === 'clean')
  assert('越界 seed 回落默认 42', m.useDesignStore.getState().seed === 42)
  assert('其余字段仍正确还原（wave/neon）',
    m.useDesignStore.getState().pattern === 'wave' &&
    m.useDesignStore.getState().palette.join(',') === ['#ff00ff', '#00ffff', '#ffff00', '#ff6600', '#66ff00'].join(','))
  assert('顶部说明越界原因', m.useShareStore.getState().issues.some(i => i.includes('超出允许范围')))
}

// === 场景 5：最近打开一键恢复 / 损坏记录拒绝 / 清空 + 空态数据 ===
m = await loadFreshBundle('s5', '')
{
  const entry = m.useHistoryStore.getState().entries[0]
  assert('新会话仍能从 localStorage 读到历史', !!entry)
  const ok = m.useShareStore.getState().restore(entry.query)
  assert('一键恢复成功', ok)
  assert('恢复后 seed=777', m.useDesignStore.getState().seed === 777)
  assert('恢复后 status=clean 且地址栏同步',
    m.useShareStore.getState().status === 'clean' && currentUrl.includes('s=777'))

  const bad = m.useShareStore.getState().restore('p=spiral&s=1&c=deadbeef')
  assert('损坏记录恢复被拒绝', bad === false)

  m.useHistoryStore.getState().clear()
  assert('清空后列表为空（页面显示空态）', m.useHistoryStore.getState().entries.length === 0)
  assert('localStorage 同步清除', globalThis.localStorage.getItem('generative-art.history.v1') === null)
}

for (const t of ['s1', 's2', 's3', 's4', 's5']) { try { rmSync(`/tmp/full-${t}.mjs`) } catch {} }
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
