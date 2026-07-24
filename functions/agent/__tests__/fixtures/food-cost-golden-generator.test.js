'use strict';

/**
 * D2 golden-master generator / live-side parity assert (design §7.1, the
 * probe-validated shape — do not restructure the preamble).
 *
 * Dual mode:
 *  - GOLDEN_REGEN=1 → runs the LIVE browser modules and (re)writes
 *    food-cost-golden.json.
 *  - default (assert) → runs the LIVE browser modules and deep-equals their
 *    output against the committed golden. This rides `npm test`, so any edit
 *    to the live calculators that changes behaviour goes red here.
 *
 * REGENERATION REQUIRES TZ=Africa/Johannesburg (design P8 — the live modules
 * bucket day-of-week via local-timezone getDay(); regenerating on a UTC-local
 * machine can shift weekday buckets). Exact command, from the repo root:
 *
 *   TZ=Africa/Johannesburg GOLDEN_REGEN=1 npx vitest run functions/agent/__tests__/fixtures/food-cost-golden-generator.test.js
 *
 * (On Windows run it from Git Bash so the TZ env var applies.)
 *
 * Import-order contract: window/document stubs MUST be installed before the
 * live modules load — firebase-helpers.js reads window.firebaseExports at
 * module scope (lines 244-245); without the stub the import chain emits
 * unhandled rejections and the run exits 1 even with green tests. The three
 * live modules are therefore dynamic-imported in beforeAll, AFTER
 * vi.useFakeTimers()/vi.setSystemTime pin the clock. Do NOT vi.mock
 * firebase-helpers.js (the mock only matches with the ?v= query verbatim and
 * silently no-ops without it).
 *
 * describe/it/expect/vi are vitest globals (root vitest.config.js
 * `globals: true`), matching the CJS convention of this __tests__ tree.
 */
const fs = require('node:fs');
const path = require('node:path');
const inputs = require('./food-cost-golden-inputs.js');

// §7.1 preamble: stubs BEFORE any import of the live browser modules.
globalThis.window = {
    firebaseExports: { rtdb: {}, auth: {}, ref() {}, get() {} }
};
globalThis.document = {
    addEventListener() {},
    removeEventListener() {}
};

const GOLDEN_PATH = path.join(__dirname, 'food-cost-golden.json');
const REGEN = Boolean(process.env.GOLDEN_REGEN);

const scenarioNames = Object.keys(inputs.scenarios);

/**
 * Run the full live chain for one item against a scenario's records:
 * stats → basic order details → criticality → advanced order details.
 */
function runChain(mods, scenario, item) {
    const stats = mods.HistoricalUsageService.calculateItemStatistics(
        scenario.records,
        item.itemCode
    );
    const orderDetails = mods.calculateOrderDetails(item, scenario.params);
    const criticality = mods.calculateCriticalityScore(
        item,
        stats,
        scenario.params
    );
    const advanced = mods.calculateAdvancedOrderDetails(
        item,
        stats,
        scenario.params
    );
    return { stats, orderDetails, criticality, advanced };
}

let actual; // { [scenarioName]: serialized chain results }

beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(inputs.PINNED_NOW_ISO));

    // Live modules — imported only now, with stubs + fake timers in place.
    const husMod = await import(
        '../../../../public/js/modules/food-cost/services/historical-usage-service.js'
    );
    const ocMod = await import(
        '../../../../public/js/modules/food-cost/order-calculator.js'
    );
    const advMod = await import(
        '../../../../public/js/modules/food-cost/order-calculator-advanced.js'
    );

    const mods = {
        HistoricalUsageService: husMod.default,
        calculateOrderDetails: ocMod.calculateOrderDetails,
        calculateCriticalityScore: ocMod.calculateCriticalityScore,
        calculateAdvancedOrderDetails: advMod.calculateAdvancedOrderDetails
    };

    actual = Object.fromEntries(
        scenarioNames.map(name => {
            const scenario = inputs.scenarios[name];
            const result = runChain(mods, scenario, scenario.item);
            if (scenario.itemNoCost) {
                // missingCost carries a second item with NO unitCost field (GT1).
                result.noCostFieldItem = runChain(mods, scenario, scenario.itemNoCost);
            }
            // Exact-deep-JSON comparison contract (§7.1): serialize once here so
            // Dates become ISO strings identically in both modes.
            return [name, JSON.parse(JSON.stringify(result))];
        })
    );
});

afterAll(() => {
    vi.useRealTimers();
});

describe('food-cost golden master (live modules)', () => {
    // Sanity probes that must hold in BOTH modes — prove the fake-timer + dow
    // chain is live rather than silently skipped.
    it('dow22daily produces dowPatterns with an applied Friday spike (Q5/P8)', () => {
        const stats = actual.dow22daily.stats;
        expect(stats.dataPoints).toBe(22);
        expect(stats.dowPatterns).not.toBeNull();
        expect(stats.dowPatterns.friday.dataPoints).toBeGreaterThan(2);
        expect(stats.dowPatterns.friday.index).toBeGreaterThan(1);
    });

    it('stockout escalates coveringDays in the advanced path (Q7)', () => {
        const adv = actual.stockout.advanced;
        expect(adv.stockStatus.isStockout).toBe(true);
        // Q7: coveringDays → max(2×2, 7) = 7 for a stockout item.
        expect(adv.stockDetails.coveringDays).toBe(7);
    });

    if (REGEN) {
        it('regenerates food-cost-golden.json', () => {
            fs.writeFileSync(
                GOLDEN_PATH,
                JSON.stringify(actual, null, 2) + '\n',
                'utf8'
            );
            expect(Object.keys(actual)).toEqual(scenarioNames);
        });
    } else {
        const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));

        it('golden file covers exactly the lattice scenarios', () => {
            expect(Object.keys(golden)).toEqual(scenarioNames);
        });

        it.each(scenarioNames)(
            'live modules still match committed golden: %s',
            name => {
                expect(actual[name]).toEqual(golden[name]);
            }
        );
    }
});
