import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'

await build({
  entryPoints: ['src/share/codec.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '/tmp/codec.test.mjs',
  logLevel: 'silent',
})

const c = await import(pathToFileURL('/tmp/codec.test.mjs').href)
const { encodeSettings, decodeLocation, DEFAULT_SETTINGS, sameSettings, settingsFromDesign } = c

let passed = 0, failed = 0
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅', name) }
  else { failed++; console.log('  ❌', name, extra ?? '') }
}

// 1. 往返：任意设置编码后解码完全一致
const sample = { pattern: 'wave', seed: 12345, iterations: 320, scale: 1.7, rotation: 90, strokeWidth: 2.5, opacity: 0.65, themeId: 'neon' }
const q = encodeSettings(sample)
const d = decodeLocation(q)
assert('round-trip 还原全部参数', JSON.stringify(d.settings) === JSON.stringify(sample), JSON.stringify(d))
assert('round-trip 无 issue', d.issues.length === 0 && !d.fatal && d.hasShare)

// 2. 刷新一致性：编码确定，同一作品永远得到同一 query
assert('编码确定性（刷新=复制链接）', encodeSettings(sample) === encodeSettings(JSON.parse(JSON.stringify(sample))))
assert('sameSettings 判定', sameSettings(sample, JSON.parse(JSON.stringify(sample))))

// 3. 地址里带 ? 与不带等价
assert('带前导 ? 也能解析', decodeLocation('?' + q).settings?.seed === 12345)

// 4. 篡改任意值 → 校验码不匹配 → 整体退回默认 + 原因
const params = new URLSearchParams(q)
params.set('s', '999') // 改种子但不改校验码
const tampered = decodeLocation(params.toString())
assert('篡改参数 → fatal', tampered.fatal && tampered.settings === null)
assert('篡改原因说明', tampered.issues[0]?.includes('校验码'))

// 5. 删除校验码 → fatal
params.delete('c')
assert('缺少校验码 → fatal', decodeLocation(params.toString()).fatal)

// 6. 单字段缺失（重算校验码模拟"构造缺失"的情况）
function makeQuery(overrides) {
  const merged = { ...sample, ...overrides }
  // 手工构造：直接用 encode 后删字段不可行（校验会失败），所以这里构造"校验码与缺字段一致"的链接
  // 模拟服务端/旧版本生成链接缺少字段但哈希基于缺省值
  const FIELDS_ORDER = ['p', 's', 'i', 'z', 'r', 'w', 'o', 't']
  const map = { p: merged.pattern, s: String(merged.seed), i: String(merged.iterations), z: String(merged.scale), r: String(merged.rotation), w: String(merged.strokeWidth), o: String(merged.opacity), t: String(merged.themeId) }
  const pairs = FIELDS_ORDER.map(k => `${k}=${map[k] ?? ''}`).join('&')
  let h = 0x811c9dc5
  const str = pairs
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  const check = (h >>> 0).toString(16).padStart(8, '0')
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(map)) { if (v !== '' && overrides[k] !== undefined) usp.set(k, v) }
  usp.set('c', check)
  return usp.toString()
}
// 缺少 seed：哈希基于空值
{
  const FIELDS_ORDER = ['p', 's', 'i', 'z', 'r', 'w', 'o', 't']
  const map = { p: sample.pattern, s: '', i: String(sample.iterations), z: String(sample.scale), r: String(sample.rotation), w: String(sample.strokeWidth), o: String(sample.opacity), t: sample.themeId }
  const str = FIELDS_ORDER.map(k => `${k}=${map[k]}`).join('&')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(map)) if (v !== '') usp.set(k, v)
  usp.set('c', (h >>> 0).toString(16).padStart(8, '0'))
  const miss = decodeLocation(usp.toString())
  assert('缺字段 → 非 fatal，回落默认', !miss.fatal && miss.settings.seed === DEFAULT_SETTINGS.seed)
  assert('缺字段原因说明', miss.issues.some(x => x.includes('种子') && x.includes('缺少')))
}

// 7. 越界值（校验通过后逐字段校验）
function validCheckFor(over) {
  // 构造合法校验码：用默认值结构，仅替换 short 值，哈希按替换后的原始值计算
  const base = { p: sample.pattern, s: String(sample.seed), i: String(sample.iterations), z: String(sample.scale), r: String(sample.rotation), w: String(sample.strokeWidth), o: String(sample.opacity), t: sample.themeId, ...over }
  const str = ['p','s','i','z','r','w','o','t'].map(k => `${k}=${base[k]}`).join('&')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  const usp = new URLSearchParams(base)
  usp.set('c', (h >>> 0).toString(16).padStart(8, '0'))
  return usp.toString()
}
const oor = decodeLocation(validCheckFor({ s: '999999' }))
assert('越界 seed → 回落默认 42', !oor.fatal && oor.settings.seed === 42)
assert('越界原因含范围', oor.issues[0]?.includes('超出允许范围'))

const oor2 = decodeLocation(validCheckFor({ o: '5' }))
assert('越界 opacity → 默认 0.8', oor2.settings.opacity === 0.8)

const badPat = decodeLocation(validCheckFor({ p: 'voronoi' }))
assert('非法图案 → 默认 spiral', badPat.settings.pattern === 'spiral')
assert('非法图案原因', badPat.issues[0]?.includes('图案类型'))

const badTheme = decodeLocation(validCheckFor({ t: 'hacker' }))
assert('非法主题 → 默认 sunset', badTheme.settings.themeId === 'sunset')

const nan = decodeLocation(validCheckFor({ z: 'abc' }))
assert('非数字 → 默认 1', nan.settings.scale === 1 && nan.issues[0].includes('有效数字'))

const floatInt = decodeLocation(validCheckFor({ i: '12.5' }))
assert('整数字段给小数 → 默认', floatInt.settings.iterations === 200)

// 8. 无参数 → 全新状态
{
  const e = decodeLocation('')
  assert('空地址 → 非分享', !e.hasShare && !e.fatal && e.settings === null)
  const e2 = decodeLocation('?foo=bar')
  assert('未知参数不算分享', !e2.hasShare)
}

// 9. 边界值合法
{
  const edge = { pattern: 'spiral', seed: 0, iterations: 10, scale: 0.1, rotation: 0, strokeWidth: 0.5, opacity: 0.1, themeId: 'sunset' }
  assert('最小边界合法', decodeLocation(encodeSettings(edge)).issues.length === 0)
  const edge2 = { ...edge, seed: 99999, iterations: 500, scale: 3, rotation: 360, strokeWidth: 5, opacity: 1 }
  assert('最大边界合法', decodeLocation(encodeSettings(edge2)).issues.length === 0)
}

// 10. settingsFromDesign：调色板反查主题
{
  const design = { pattern: 'circles', seed: 7, iterations: 200, scale: 1, rotation: 0, strokeWidth: 1.5, opacity: 0.8, bgColor: '#000', palette: ['#ff00ff','#00ffff','#ffff00','#ff6600','#66ff00'], width: 800, height: 1000 }
  assert('调色板反查 neon 主题', settingsFromDesign(design).themeId === 'neon')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
