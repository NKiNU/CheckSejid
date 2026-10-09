import { expect, test } from 'vitest'
import { safeNext } from './safeNext.ts'

test('keeps same-origin paths', () => {
  expect(safeNext('/org/abc/finance?x=1')).toBe('/org/abc/finance?x=1')
})
test('rejects anything that could leave the origin', () => {
  for (const bad of [null, '', 'feed', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)'])
    expect(safeNext(bad)).toBe('/feed')
})
