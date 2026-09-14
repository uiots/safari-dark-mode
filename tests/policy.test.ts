import {describe, expect, it} from 'vitest';
import {decidePolicy} from '../src/shared/policy';
import {validateSettings} from '../src/shared/settings';

describe('fixed policy precedence', () => {
  const cases = [
    [{enabled: false, siteModes: {'example.com': 'force'}}, true, false, 'disabled'],
    [{enabled: true, siteModes: {'example.com': 'off'}}, false, false, 'disabled'],
    [{enabled: true, siteModes: {'example.com': 'force'}}, true, true, 'forced'],
    [{enabled: true, siteModes: {'example.com': 'auto'}}, true, false, 'native-dark'],
    [{enabled: true}, false, true, 'forced'],
    [{enabled: true}, true, true, 'forced'],
  ] as const;

  for (const [partial, detected, apply, status] of cases) {
    it(`${JSON.stringify(partial)} + native=${String(detected)} -> ${status}`, () => {
      expect(decidePolicy(validateSettings(partial), 'example.com', detected)).toEqual({apply, status});
    });
  }

  it('isolates parent and subdomain rules', () => {
    const settings = validateSettings({siteModes: {'example.com': 'off'}});
    expect(decidePolicy(settings, 'example.com', false).apply).toBe(false);
    expect(decidePolicy(settings, 'www.example.com', false).apply).toBe(true);
  });
});
