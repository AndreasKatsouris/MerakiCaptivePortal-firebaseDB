/**
 * Unit Tests for Forecast Engine
 *
 * Tests all 6 forecasting methods with known datasets and edge cases
 */

import { ForecastEngine } from '../../../public/js/modules/sales-forecasting/forecast-engine.js';

describe('ForecastEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new ForecastEngine();
    });

    describe('Constructor', () => {
        test('should initialize with null analyticsData', () => {
            expect(engine.analyticsData).toBeNull();
        });
    });

    describe('Input Validation', () => {
        test('should throw error when historicalData is null', async () => {
            await expect(
                engine.generateForecast(null, { method: 'seasonal', horizon: 30 })
            ).rejects.toThrow('Historical data must be a non-empty array');
        });

        test('should throw error when historicalData is empty array', async () => {
            await expect(
                engine.generateForecast([], { method: 'seasonal', horizon: 30 })
            ).rejects.toThrow('Historical data is required for forecasting');
        });

        test('should throw error when config is null', async () => {
            const data = [{ date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 }];
            await expect(
                engine.generateForecast(data, null)
            ).rejects.toThrow('Config must be a valid object');
        });

        test('should throw error when horizon is out of range', async () => {
            const data = [{ date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 }];
            await expect(
                engine.generateForecast(data, { horizon: 400 })
            ).rejects.toThrow('Horizon must be a number between 1 and 365');
        });

        test('should throw error when confidence level is invalid', async () => {
            const data = [{ date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 }];
            await expect(
                engine.generateForecast(data, { horizon: 30, confidenceLevel: 75 })
            ).rejects.toThrow('Confidence level must be 0, 80, 90, 95, or 99');
        });
    });

    describe('normalizeData', () => {
        test('should normalize data with string dates', () => {
            const input = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024-01-02', revenue: 1200, transactions: 60, avgSpend: 20 }
            ];
            const normalized = engine.normalizeData(input);

            expect(normalized).toHaveLength(2);
            expect(normalized[0].date).toBeInstanceOf(Date);
            expect(normalized[0].revenue).toBe(1000);
            expect(normalized[0].transactions).toBe(50);
        });

        test('should handle alternative property names', () => {
            const input = [
                { date: '2024-01-01', revenue: 1000, transaction_qty: 50, avg_spend: 20 }
            ];
            const normalized = engine.normalizeData(input);

            expect(normalized[0].transactions).toBe(50);
            expect(normalized[0].avgSpend).toBe(20);
        });

        test('should filter out invalid dates', () => {
            const input = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: 'invalid', revenue: 1200, transactions: 60, avgSpend: 20 },
                { date: '2024-01-02', revenue: 1100, transactions: 55, avgSpend: 20 }
            ];
            const normalized = engine.normalizeData(input);

            expect(normalized).toHaveLength(2);
        });

        test('should filter out zero revenue entries', () => {
            const input = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024-01-02', revenue: 0, transactions: 0, avgSpend: 0 },
                { date: '2024-01-03', revenue: 1100, transactions: 55, avgSpend: 20 }
            ];
            const normalized = engine.normalizeData(input);

            expect(normalized).toHaveLength(2);
        });

        test('should sort data by date', () => {
            const input = [
                { date: '2024-01-03', revenue: 1100, transactions: 55, avgSpend: 20 },
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024-01-02', revenue: 1200, transactions: 60, avgSpend: 20 }
            ];
            const normalized = engine.normalizeData(input);

            expect(normalized[0].date.getDate()).toBe(1);
            expect(normalized[1].date.getDate()).toBe(2);
            expect(normalized[2].date.getDate()).toBe(3);
        });
    });

    describe('linearRegressionForecast', () => {
        test('should throw error with single data point', () => {
            const data = [{ date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 }];

            expect(() => {
                engine.linearRegressionForecast(data, 7);
            }).toThrow('Linear regression requires at least 2 data points');
        });

        test('should calculate correct slope for upward trend', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: new Date('2024-01-02'), revenue: 1100, transactions: 55, avgSpend: 20 },
                { date: new Date('2024-01-03'), revenue: 1200, transactions: 60, avgSpend: 20 },
                { date: new Date('2024-01-04'), revenue: 1300, transactions: 65, avgSpend: 20 }
            ];

            const predictions = engine.linearRegressionForecast(data, 3);

            expect(predictions).toHaveLength(3);
            expect(predictions[0].revenue).toBeGreaterThan(1300);
            expect(predictions[1].revenue).toBeGreaterThan(predictions[0].revenue);
        });

        test('should calculate correct slope for downward trend', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1300, transactions: 65, avgSpend: 20 },
                { date: new Date('2024-01-02'), revenue: 1200, transactions: 60, avgSpend: 20 },
                { date: new Date('2024-01-03'), revenue: 1100, transactions: 55, avgSpend: 20 },
                { date: new Date('2024-01-04'), revenue: 1000, transactions: 50, avgSpend: 20 }
            ];

            const predictions = engine.linearRegressionForecast(data, 3);

            expect(predictions).toHaveLength(3);
            expect(predictions[0].revenue).toBeLessThan(1000);
        });

        test('should never return negative revenue', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 100, transactions: 10, avgSpend: 10 },
                { date: new Date('2024-01-02'), revenue: 50, transactions: 5, avgSpend: 10 }
            ];

            const predictions = engine.linearRegressionForecast(data, 10);

            predictions.forEach(pred => {
                expect(pred.revenue).toBeGreaterThanOrEqual(0);
            });
        });

        test('should return correct number of predictions', () => {
            const data = generateMockData(30);
            const horizons = [7, 14, 30, 60, 90];

            horizons.forEach(horizon => {
                const predictions = engine.linearRegressionForecast(data, horizon);
                expect(predictions).toHaveLength(horizon);
            });
        });

        test('should use historical average spend when transactions are zero', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: new Date('2024-01-02'), revenue: 1100, transactions: 55, avgSpend: 20 }
            ];

            const predictions = engine.linearRegressionForecast(data, 5);

            // Even if predicted transactions become 0, avgSpend should be historical average
            predictions.forEach(pred => {
                expect(pred.avgSpend).toBeGreaterThan(0);
            });
        });
    });

    describe('exponentialSmoothingForecast', () => {
        test('should throw error when alpha is out of range', () => {
            const data = generateMockData(10);

            expect(() => {
                engine.exponentialSmoothingForecast(data, 7, null, 0);
            }).toThrow('Alpha must be between 0 and 1 (exclusive)');

            expect(() => {
                engine.exponentialSmoothingForecast(data, 7, null, 1);
            }).toThrow('Alpha must be between 0 and 1 (exclusive)');

            expect(() => {
                engine.exponentialSmoothingForecast(data, 7, null, -0.1);
            }).toThrow('Alpha must be between 0 and 1 (exclusive)');
        });

        test('should smooth volatile data', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: new Date('2024-01-02'), revenue: 2000, transactions: 100, avgSpend: 20 },
                { date: new Date('2024-01-03'), revenue: 500, transactions: 25, avgSpend: 20 },
                { date: new Date('2024-01-04'), revenue: 1500, transactions: 75, avgSpend: 20 }
            ];

            const predictions = engine.exponentialSmoothingForecast(data, 5);

            expect(predictions).toHaveLength(5);
            // Predictions should be smoother than raw data
            predictions.forEach(pred => {
                expect(pred.revenue).toBeGreaterThan(0);
            });
        });
    });

    describe('seasonalForecast', () => {
        test('should detect weekly patterns', () => {
            const data = generateWeeklyPatternData(28); // 4 weeks

            const predictions = engine.seasonalForecast(data, 7);

            expect(predictions).toHaveLength(7);
            // Weekend days should have higher revenue
            const saturdayPred = predictions.find(p => p.date.getDay() === 6);
            const mondayPred = predictions.find(p => p.date.getDay() === 1);

            if (saturdayPred && mondayPred) {
                expect(saturdayPred.revenue).toBeGreaterThan(mondayPred.revenue);
            }
        });

        test('should handle single week of data', () => {
            const data = generateMockData(7);

            const predictions = engine.seasonalForecast(data, 7);

            expect(predictions).toHaveLength(7);
        });
    });

    describe('mlBasedForecast', () => {
        test('should combine multiple signals', () => {
            const data = generateMockData(60); // 2 months of data

            const predictions = engine.mlBasedForecast(data, 30);

            expect(predictions).toHaveLength(30);
            predictions.forEach(pred => {
                expect(pred.revenue).toBeGreaterThan(0);
                expect(pred.transactionQty).toBeGreaterThanOrEqual(0);
                expect(pred.avgSpend).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('applyConfidenceIntervals', () => {
        test('should add confidence bounds to predictions', () => {
            const data = generateMockData(30);
            const predictions = engine.linearRegressionForecast(data, 7);

            const withConfidence = engine.applyConfidenceIntervals(predictions, data, 95);

            withConfidence.forEach(pred => {
                expect(pred.confidenceLower).toBeDefined();
                expect(pred.confidenceUpper).toBeDefined();
                expect(pred.confidenceLower).toBeLessThanOrEqual(pred.revenue);
                expect(pred.confidenceUpper).toBeGreaterThanOrEqual(pred.revenue);
            });
        });

        test('should have wider intervals for later predictions', () => {
            const data = generateMockData(30);
            const predictions = engine.linearRegressionForecast(data, 30);

            const withConfidence = engine.applyConfidenceIntervals(predictions, data, 95);

            const firstInterval = withConfidence[0].confidenceUpper - withConfidence[0].confidenceLower;
            const lastInterval = withConfidence[29].confidenceUpper - withConfidence[29].confidenceLower;

            expect(lastInterval).toBeGreaterThan(firstInterval);
        });

        test('should never have negative lower bound', () => {
            const data = generateMockData(10);
            const predictions = engine.linearRegressionForecast(data, 10);

            const withConfidence = engine.applyConfidenceIntervals(predictions, data, 95);

            withConfidence.forEach(pred => {
                expect(pred.confidenceLower).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Helper Methods', () => {
        describe('calculateAvgTransactionRatio', () => {
            test('should calculate correct ratio from valid data', () => {
                const data = [
                    { revenue: 1000, transactions: 50, avgSpend: 20 },
                    { revenue: 2000, transactions: 100, avgSpend: 20 }
                ];

                const ratio = engine.calculateAvgTransactionRatio(data);

                expect(ratio).toBeCloseTo(0.05, 3);
            });

            test('should use fallback when no valid data', () => {
                const data = [
                    { revenue: 0, transactions: 0, avgSpend: 0 }
                ];

                const ratio = engine.calculateAvgTransactionRatio(data);

                expect(ratio).toBeGreaterThan(0);
                expect(ratio).toBe(1 / 140); // Fallback value
            });
        });

        describe('calculateWeeklyPatterns', () => {
            test('should identify weekend spikes', () => {
                const data = generateWeeklyPatternData(28);

                const patterns = engine.calculateWeeklyPatterns(data);

                // Saturday (6) and Sunday (0) should have factors > 1
                expect(patterns[6]).toBeGreaterThan(1);
                expect(patterns[0]).toBeGreaterThan(1);
            });
        });

        describe('calculateVolatility', () => {
            test('should return 0 for single data point', () => {
                const data = [{ revenue: 1000 }];

                const volatility = engine.calculateVolatility(data);

                expect(volatility).toBe(0);
            });

            test('should calculate higher volatility for volatile data', () => {
                const stableData = [
                    { revenue: 1000 }, { revenue: 1010 }, { revenue: 990 }, { revenue: 1005 }
                ];
                const volatileData = [
                    { revenue: 1000 }, { revenue: 2000 }, { revenue: 500 }, { revenue: 1500 }
                ];

                const stableVol = engine.calculateVolatility(stableData);
                const volatileVol = engine.calculateVolatility(volatileData);

                expect(volatileVol).toBeGreaterThan(stableVol);
            });
        });

        describe('calculateTrendSlope', () => {
            test('should return 0 with insufficient data', () => {
                const data = generateMockData(5);

                const slope = engine.calculateTrendSlope(data);

                expect(slope).toBe(0);
            });

            test('should return positive slope for upward trend', () => {
                const data = [];
                for (let i = 0; i < 14; i++) {
                    data.push({
                        date: new Date(2024, 0, i + 1),
                        revenue: 1000 + i * 100,
                        transactions: 50 + i * 5,
                        avgSpend: 20
                    });
                }

                const slope = engine.calculateTrendSlope(data);

                expect(slope).toBeGreaterThan(0);
            });

            test('should handle zero previous average', () => {
                const data = [];
                // First week all zeros
                for (let i = 0; i < 7; i++) {
                    data.push({ revenue: 0, transactions: 0, avgSpend: 0 });
                }
                // Second week has revenue
                for (let i = 0; i < 7; i++) {
                    data.push({ revenue: 1000, transactions: 50, avgSpend: 20 });
                }

                const slope = engine.calculateTrendSlope(data);

                expect(slope).toBe(1); // 100% growth from 0
            });
        });
    });

    describe('Edge Cases', () => {
        test('should handle single data point gracefully for seasonal method', () => {
            const data = [{ date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 }];

            const predictions = engine.seasonalForecast(data, 7);

            expect(predictions).toHaveLength(7);
        });

        test('should handle gaps in dates', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1000, transactions: 50, avgSpend: 20 },
                // Gap of several days
                { date: new Date('2024-01-10'), revenue: 1100, transactions: 55, avgSpend: 20 },
                { date: new Date('2024-01-11'), revenue: 1200, transactions: 60, avgSpend: 20 }
            ];

            const predictions = engine.linearRegressionForecast(data, 7);

            expect(predictions).toHaveLength(7);
        });

        test('should handle very large revenue values', () => {
            const data = [
                { date: new Date('2024-01-01'), revenue: 1000000, transactions: 500, avgSpend: 2000 },
                { date: new Date('2024-01-02'), revenue: 1100000, transactions: 550, avgSpend: 2000 }
            ];

            const predictions = engine.linearRegressionForecast(data, 7);

            expect(predictions[0].revenue).toBeGreaterThan(1000000);
            expect(Number.isFinite(predictions[0].revenue)).toBe(true);
        });
    });

    describe('Full Integration Tests', () => {
        test('should generate complete forecast with all features', async () => {
            const data = generateMockData(60);
            const config = {
                method: 'seasonal',
                horizon: 30,
                confidenceLevel: 95,
                startDate: null
            };

            const result = await engine.generateForecast(data, config);

            expect(result.method).toBe('seasonal');
            expect(result.horizon).toBe(30);
            expect(result.confidenceLevel).toBe(95);
            expect(result.predictions).toHaveLength(30);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.dataPointsUsed).toBe(60);

            // Check predictions structure
            result.predictions.forEach(pred => {
                expect(pred.revenue).toBeGreaterThanOrEqual(0);
                expect(pred.transactionQty).toBeGreaterThanOrEqual(0);
                expect(pred.avgSpend).toBeGreaterThanOrEqual(0);
                expect(pred.confidenceLower).toBeDefined();
                expect(pred.confidenceUpper).toBeDefined();
            });
        });
    });
});

// Helper functions for test data generation

function generateMockData(days) {
    const data = [];
    const baseRevenue = 10000;
    const startDate = new Date('2024-01-01');

    for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        // Add some randomness and weekly pattern
        const dayOfWeek = date.getDay();
        const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.5 : 1.0;
        const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
        const revenue = baseRevenue * weekendBoost * randomFactor;

        data.push({
            date,
            revenue,
            transactions: Math.round(revenue / 200),
            avgSpend: 200
        });
    }

    return data;
}

function generateWeeklyPatternData(days) {
    const data = [];
    const baseRevenue = 10000;
    const startDate = new Date('2024-01-01'); // Start on a Monday

    for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        const dayOfWeek = date.getDay();
        let factor = 1.0;

        // Clear weekly pattern
        switch (dayOfWeek) {
            case 0: // Sunday
                factor = 1.6;
                break;
            case 6: // Saturday
                factor = 1.8;
                break;
            case 5: // Friday
                factor = 1.3;
                break;
            default: // Weekdays
                factor = 0.9;
        }

        const revenue = baseRevenue * factor;

        data.push({
            date,
            revenue,
            transactions: Math.round(revenue / 200),
            avgSpend: 200
        });
    }

    return data;
}
