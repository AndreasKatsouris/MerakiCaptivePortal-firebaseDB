import { describe, test, expect } from 'vitest';
import { renderFlagBadgeCluster } from '../components/flags/FlagBadge.js';

describe('renderFlagBadgeCluster', () => {
  test('returns empty string for no flags', () => {
    expect(renderFlagBadgeCluster({})).toBe('');
    expect(renderFlagBadgeCluster(null)).toBe('');
    expect(renderFlagBadgeCluster(undefined)).toBe('');
  });

  test('renders one pill per manual flag with human-readable label', () => {
    const html = renderFlagBadgeCluster({
      manualFlags: { OUT_OF_STOCK: {}, OFF_MENU: {} }
    });
    expect(html).toContain('OUT OF STOCK');
    expect(html).toContain('OFF MENU');
    expect((html.match(/<span/g) || []).length).toBe(2);
  });

  test('renders auto flags with severity colors', () => {
    const html = renderFlagBadgeCluster({
      autoFlags: { COST_SPIKE: { severity: 'critical' } }
    });
    expect(html).toMatch(/bg-danger/);
    expect(html).toContain('COST SPIKE');
  });

  test('manual OUT_OF_STOCK maps to warning color class', () => {
    const html = renderFlagBadgeCluster({ manualFlags: { OUT_OF_STOCK: {} } });
    expect(html).toMatch(/bg-warning/);
  });

  test('CUSTOM flag uses customLabel when provided', () => {
    const html = renderFlagBadgeCluster({
      manualFlags: { CUSTOM: { customLabel: 'VIP special' } }
    });
    expect(html).toContain('VIP special');
    expect(html).not.toContain('>CUSTOM<');
  });

  test('escapes HTML in custom labels to prevent XSS', () => {
    const html = renderFlagBadgeCluster({
      manualFlags: { CUSTOM: { customLabel: '<script>x</script>' } }
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('combines manual + auto flags in a single cluster', () => {
    const html = renderFlagBadgeCluster({
      manualFlags: { OUT_OF_STOCK: {} },
      autoFlags: { COST_SPIKE: { severity: 'critical' } }
    });
    expect((html.match(/<span/g) || []).length).toBe(2);
  });
});
