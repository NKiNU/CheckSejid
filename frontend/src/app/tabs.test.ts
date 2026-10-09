import { expect, test } from 'vitest'
import { communityTabs, orgTabs } from './tabs.ts'

test('org tabs hide Finance and Ops without permission', () => {
  const to = (p: string[]) => orgTabs('o1', new Set(p)).map((t) => t.to)
  expect(to([])).toEqual(['/org/o1', '/org/o1/hub', '/org/o1/more'])
  expect(to(['finance.read', 'operations.read'])).toEqual(['/org/o1', '/org/o1/hub', '/org/o1/finance', '/org/o1/operations', '/org/o1/more'])
})
test('community tabs add Feed and Alerts only when signed in', () => {
  expect(communityTabs(false).map((t) => t.to)).toEqual(['/', '/#prayer'])
  expect(communityTabs(true).map((t) => t.to)).toEqual(['/', '/feed', '/#prayer', '/notifications'])
})
