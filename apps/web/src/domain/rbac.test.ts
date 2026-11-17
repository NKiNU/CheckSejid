import { hasCapability, lowestPlanWith, trialDaysLeft } from './entitlements';
import { can } from './rbac';

describe('permissions and entitlements are separate', () => {
  it('maps roles to permissions', () => {
    expect(can('treasurer', 'finance.approve')).toBe(true);
    expect(can('treasurer', 'bulletin.publish')).toBe(false);
    expect(can('committee', 'bulletin.publish')).toBe(true);
    expect(can('staff', 'finance.approve')).toBe(false);
  });
  it('gates capabilities by plan', () => {
    expect(hasCapability('FREE', 'bulletin')).toBe(true);
    expect(hasCapability('FREE', 'finance')).toBe(false);
    expect(lowestPlanWith('auditLogReport')).toBe('PROFESSIONAL');
    expect(lowestPlanWith('finance')).toBe('STARTER');
  });
  it('counts trial days left', () => {
    expect(trialDaysLeft('2026-12-10T00:00:00Z', new Date('2026-11-17T00:00:00Z'))).toBe(23);
    expect(trialDaysLeft('2026-11-01T00:00:00Z', new Date('2026-11-17T00:00:00Z'))).toBe(0);
  });
});
