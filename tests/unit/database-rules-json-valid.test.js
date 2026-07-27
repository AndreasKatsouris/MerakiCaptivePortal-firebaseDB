import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', '..', 'database.rules.json');

describe('database.rules.json strict JSON validity', () => {
  it('parses with strict JSON.parse (no embedded literal newlines/control chars in rule strings)', () => {
    const raw = readFileSync(RULES_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('bookings.$bookingId read/write rules are unchanged in meaning (single-line, same tokens as the source multi-line expression)', () => {
    const raw = readFileSync(RULES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const bookingRules = parsed.rules.bookings.$bookingId;

    // Same set of clauses must still be present, just collapsed onto one line —
    // this is a formatting normalization, not a semantic change.
    expect(bookingRules['.read']).toContain("auth.token.admin === true");
    expect(bookingRules['.read']).toContain("root.child('admin-claims').child(auth.uid).exists()");
    expect(bookingRules['.read']).toContain("root.child('locations').child(data.child('location').val()).child('ownerId').val() === auth.uid");
    expect(bookingRules['.read']).toContain("root.child('userLocations').child(auth.uid).child(data.child('location').val()).exists()");

    expect(bookingRules['.write']).toContain("auth.token.admin === true");
    expect(bookingRules['.write']).toContain("root.child('admin-claims').child(auth.uid).exists()");
    expect(bookingRules['.write']).toContain("root.child('locations').child(newData.child('location').val()).child('ownerId').val() === auth.uid");
    expect(bookingRules['.write']).toContain("root.child('userLocations').child(auth.uid).child(newData.child('location').val()).exists()");
    expect(bookingRules['.write']).toContain("root.child('locations').child(data.child('location').val()).child('ownerId').val() === auth.uid");
    expect(bookingRules['.write']).toContain("root.child('userLocations').child(auth.uid).child(data.child('location').val()).exists()");

    // No embedded newlines left in any rule-expression string anywhere in the file.
    const walk = (node) => {
      if (typeof node === 'string') {
        expect(node).not.toMatch(/\n/);
        return;
      }
      if (node && typeof node === 'object') {
        for (const value of Object.values(node)) walk(value);
      }
    };
    walk(parsed);
  });
});
