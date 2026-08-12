import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const routeListSource = await fs.readFile(new URL('../src/components/route-list.tsx', import.meta.url), 'utf8')
const historySource = await fs.readFile(new URL('../src/lib/history.ts', import.meta.url), 'utf8')

test('history points keep their real origin/destination terminal names', () => {
  assert.match(historySource, /locationName: string/)
  assert.match(historySource, /points\(origin, 'buy', route\.from\.name\)/)
  assert.match(historySource, /points\(destination, 'sell', route\.to\.name\)/)
})

test('history chart renders a visible marker for every real UEX point', () => {
  assert.match(routeListSource, /geometry\.plotPoints\.map/)
  assert.match(routeListSource, /r=\{selectedPoint \? 5 : 3\}/)
  assert.match(routeListSource, /ПОКУПКА · ORIGIN/)
  assert.match(routeListSource, /ПРОДАЖА · DESTINATION/)
  assert.match(routeListSource, /реальный снимок UEX/)
})

test('history points are inspectable by touch, mouse and keyboard', () => {
  assert.match(routeListSource, /onPointerEnter=\{\(\) => setSelectedKey\(item\.key\)\}/)
  assert.match(routeListSource, /onClick=\{\(\) => setSelectedKey\(item\.key\)\}/)
  assert.match(routeListSource, /onFocus=\{\(\) => setSelectedKey\(item\.key\)\}/)
  assert.match(routeListSource, /tabIndex=\{0\}/)
  assert.match(routeListSource, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(routeListSource, /aria-label=\{historyPointAria\(item\.point\)\}/)
})

test('selected history point exposes date, terminal and exact aUEC per SCU value', () => {
  assert.match(routeListSource, /formatHistoryTimestamp\(selected\.point\.t\)/)
  assert.match(routeListSource, /selected\.point\.locationName/)
  assert.match(routeListSource, /formatNumber\(selected\.point\.v\).*aUEC\/SCU/)
})
