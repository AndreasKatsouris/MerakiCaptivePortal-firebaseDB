/**
 * Integration Tests for Sales Data Service
 *
 * Tests Firebase RTDB operations with emulator
 */

import { SalesDataService } from '../../../public/js/modules/sales-forecasting/sales-data-service.js';
import { rtdb, ref, get, remove } from '../../../public/js/config/firebase-config.js';

describe('SalesDataService Integration Tests', () => {
    let service;
    const testUserId = 'test-user-sales-forecasting';
    const testLocationId = 'test-location-001';

    beforeAll(() => {
        // Ensure we're using Firebase emulator
        if (!process.env.FIRESTORE_EMULATOR_HOST) {
            console.warn('WARNING: Firebase emulators should be running for these tests');
        }
    });

    beforeEach(() => {
        service = new SalesDataService(testUserId);
    });

    afterEach(async () => {
        // Clean up test data after each test
        try {
            await cleanupTestData(testUserId, testLocationId);
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    describe('Constructor', () => {
        test('should initialize with valid user ID', () => {
            expect(service.userId).toBe(testUserId);
        });

        test('should throw error without user ID', () => {
            expect(() => new SalesDataService()).toThrow('User ID is required');
        });
    });

    describe('saveHistoricalData', () => {
        test('should save historical data to Firebase', async () => {
            const dailyData = generateTestDailyData(30);
            const options = { locationName: 'Test Restaurant' };

            const result = await service.saveHistoricalData(testLocationId, dailyData, options);

            expect(result.salesDataId).toBeDefined();
            expect(result.recordCount).toBe(30);
            expect(result.dateRange).toBeDefined();

            // Verify data was saved to Firebase
            const dataRef = ref(rtdb, `salesData/${result.salesDataId}`);
            const snapshot = await get(dataRef);

            expect(snapshot.exists()).toBe(true);
            const savedData = snapshot.val();
            expect(savedData.locationId).toBe(testLocationId);
            expect(savedData.userId).toBe(testUserId);
            expect(savedData.recordCount).toBe(30);
        });

        test('should throw error with empty array', async () => {
            await expect(
                service.saveHistoricalData(testLocationId, [], {})
            ).rejects.toThrow('Daily data must be a non-empty array');
        });

        test('should throw error without location ID', async () => {
            const dailyData = generateTestDailyData(10);

            await expect(
                service.saveHistoricalData(null, dailyData, {})
            ).rejects.toThrow('Location ID is required');
        });

        test('should throw error with invalid data structure', async () => {
            const invalidData = [{ revenue: 1000 }]; // Missing date

            await expect(
                service.saveHistoricalData(testLocationId, invalidData, {})
            ).rejects.toThrow('Each record must have a date field');
        });

        test('should throw error with negative revenue', async () => {
            const invalidData = [
                { date: '2024-01-01', revenue: -1000, transactions: 50, avgSpend: 20 }
            ];

            await expect(
                service.saveHistoricalData(testLocationId, invalidData, {})
            ).rejects.toThrow('Each record must have a valid non-negative revenue');
        });

        test('should handle duplicate dates by aggregating', async () => {
            const dailyData = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024-01-01', revenue: 500, transactions: 25, avgSpend: 20 } // Duplicate date
            ];

            const result = await service.saveHistoricalData(testLocationId, dailyData, {});

            const dataRef = ref(rtdb, `salesData/${result.salesDataId}`);
            const snapshot = await get(dataRef);
            const savedData = snapshot.val();

            // Should aggregate duplicate dates
            expect(savedData.dailyData['2024-01-01'].revenue).toBe(1500);
            expect(savedData.dailyData['2024-01-01'].transactions).toBe(75);
        });

        test('should calculate correct summary statistics', async () => {
            const dailyData = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024-01-02', revenue: 2000, transactions: 100, avgSpend: 20 }
            ];

            const result = await service.saveHistoricalData(testLocationId, dailyData, {});

            const dataRef = ref(rtdb, `salesData/${result.salesDataId}`);
            const snapshot = await get(dataRef);
            const savedData = snapshot.val();

            expect(savedData.summary.totalRevenue).toBe(3000);
            expect(savedData.summary.avgDailyRevenue).toBe(1500);
            expect(savedData.summary.totalTransactions).toBe(150);
            expect(savedData.summary.avgTransactionValue).toBeCloseTo(20, 1);
        });
    });

    describe('getHistoricalDataList', () => {
        test('should return empty array when no data exists', async () => {
            const list = await service.getHistoricalDataList(testLocationId);

            expect(Array.isArray(list)).toBe(true);
            expect(list).toHaveLength(0);
        });

        test('should return list of saved data sets', async () => {
            // Save two data sets
            const dailyData1 = generateTestDailyData(10);
            const dailyData2 = generateTestDailyData(20);

            await service.saveHistoricalData(testLocationId, dailyData1, { locationName: 'Test 1' });
            await service.saveHistoricalData(testLocationId, dailyData2, { locationName: 'Test 2' });

            const list = await service.getHistoricalDataList(testLocationId);

            expect(list).toHaveLength(2);
            expect(list[0].recordCount).toBeDefined();
            expect(list[0].dateRange).toBeDefined();
        });

        test('should sort by upload date descending', async () => {
            const dailyData = generateTestDailyData(10);

            const result1 = await service.saveHistoricalData(testLocationId, dailyData, {});
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 100));
            const result2 = await service.saveHistoricalData(testLocationId, dailyData, {});

            const list = await service.getHistoricalDataList(testLocationId);

            expect(list[0].id).toBe(result2.salesDataId);
            expect(list[1].id).toBe(result1.salesDataId);
        });
    });

    describe('getHistoricalData', () => {
        test('should retrieve full data set', async () => {
            const dailyData = generateTestDailyData(30);
            const saveResult = await service.saveHistoricalData(testLocationId, dailyData, {});

            const retrieved = await service.getHistoricalData(saveResult.salesDataId);

            expect(retrieved).toBeDefined();
            expect(retrieved.locationId).toBe(testLocationId);
            expect(retrieved.dailyDataArray).toHaveLength(30);
        });

        test('should throw error if data not found', async () => {
            await expect(
                service.getHistoricalData('non-existent-id')
            ).rejects.toThrow('Sales data not found');
        });
    });

    describe('deleteHistoricalData', () => {
        test('should delete data from Firebase', async () => {
            const dailyData = generateTestDailyData(10);
            const saveResult = await service.saveHistoricalData(testLocationId, dailyData, {});

            await service.deleteHistoricalData(saveResult.salesDataId);

            // Verify deletion
            const dataRef = ref(rtdb, `salesData/${saveResult.salesDataId}`);
            const snapshot = await get(dataRef);

            expect(snapshot.exists()).toBe(false);
        });

        test('should remove from indexes', async () => {
            const dailyData = generateTestDailyData(10);
            const saveResult = await service.saveHistoricalData(testLocationId, dailyData, {});

            await service.deleteHistoricalData(saveResult.salesDataId);

            // Check location index
            const locationIndexRef = ref(rtdb, `salesDataIndex/byLocation/${testLocationId}/${saveResult.salesDataId}`);
            const indexSnapshot = await get(locationIndexRef);

            expect(indexSnapshot.exists()).toBe(false);
        });
    });

    describe('saveForecast', () => {
        test('should save forecast with metadata', async () => {
            const forecast = generateTestForecast(30);
            const metadata = {
                name: 'Test Forecast',
                description: 'Test description',
                locationName: 'Test Restaurant'
            };

            const result = await service.saveForecast(
                testLocationId,
                'test-sales-data-id',
                forecast,
                metadata
            );

            expect(result.forecastId).toBeDefined();
            expect(result.success).toBe(true);

            // Verify forecast was saved
            const forecastRef = ref(rtdb, `forecasts/${result.forecastId}`);
            const snapshot = await get(forecastRef);

            expect(snapshot.exists()).toBe(true);
            const savedForecast = snapshot.val();
            expect(savedForecast.metadata.name).toBe('Test Forecast');
            expect(savedForecast.locationId).toBe(testLocationId);
        });

        test('should format predictions correctly', async () => {
            const forecast = {
                config: { method: 'seasonal', horizon: 7, confidenceLevel: 95 },
                predictions: [
                    { date: new Date('2024-01-01'), revenue: 1000, transactionQty: 50, avgSpend: 20 },
                    { date: '2024-01-02', predicted: 1100, transactionQty: 55, avgSpend: 20 }
                ]
            };

            const result = await service.saveForecast(testLocationId, null, forecast, {});

            const forecastRef = ref(rtdb, `forecasts/${result.forecastId}`);
            const snapshot = await get(forecastRef);
            const savedForecast = snapshot.val();

            // Check indexed predictions
            expect(savedForecast.predictions['2024-01-01']).toBeDefined();
            expect(savedForecast.predictions['2024-01-02']).toBeDefined();
        });
    });

    describe('saveActuals', () => {
        test('should save actuals for comparison', async () => {
            // First create a forecast
            const forecast = generateTestForecast(7);
            const forecastResult = await service.saveForecast(testLocationId, null, forecast, {});

            // Now save actuals
            const actuals = generateTestDailyData(7);
            const actualsResult = await service.saveActuals(forecastResult.forecastId, actuals);

            expect(actualsResult.actualId).toBeDefined();

            // Verify actuals were saved
            const actualsRef = ref(rtdb, `forecastActuals/${actualsResult.actualId}`);
            const snapshot = await get(actualsRef);

            expect(snapshot.exists()).toBe(true);
            const savedActuals = snapshot.val();
            expect(savedActuals.forecastId).toBe(forecastResult.forecastId);
        });

        test('should throw error if forecast not found', async () => {
            const actuals = generateTestDailyData(7);

            await expect(
                service.saveActuals('non-existent-forecast', actuals)
            ).rejects.toThrow('Forecast not found');
        });
    });

    describe('updateForecastAdjustments', () => {
        test('should update forecast adjustments', async () => {
            const forecast = generateTestForecast(7);
            const forecastResult = await service.saveForecast(testLocationId, null, forecast, {});

            const adjustments = {
                '2024-01-01': {
                    revenue: 1500,
                    transactions: 75,
                    reason: 'Special event expected'
                }
            };

            await service.updateForecastAdjustments(forecastResult.forecastId, adjustments);

            // Verify adjustments were saved
            const forecastRef = ref(rtdb, `forecasts/${forecastResult.forecastId}`);
            const snapshot = await get(forecastRef);
            const updatedForecast = snapshot.val();

            expect(updatedForecast.predictions['2024-01-01'].adjusted).toBeDefined();
            expect(updatedForecast.predictions['2024-01-01'].adjustmentReason).toBe('Special event expected');
        });
    });

    describe('Performance Tests', () => {
        test('should handle large data sets efficiently', async () => {
            const largeDataSet = generateTestDailyData(365); // 1 year

            const startTime = Date.now();
            const result = await service.saveHistoricalData(testLocationId, largeDataSet, {});
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5 seconds
            expect(result.recordCount).toBe(365);
        });

        test('should batch read operations efficiently', async () => {
            // Create multiple data sets
            for (let i = 0; i < 10; i++) {
                await service.saveHistoricalData(testLocationId, generateTestDailyData(10), {});
            }

            const startTime = Date.now();
            const list = await service.getHistoricalDataList(testLocationId);
            const endTime = Date.now();

            expect(list).toHaveLength(10);
            expect(endTime - startTime).toBeLessThan(3000); // Should complete in < 3 seconds
        });
    });

    describe('Data Integrity Tests', () => {
        test('should preserve data types', async () => {
            const dailyData = [
                {
                    date: '2024-01-01',
                    revenue: 1000.50,
                    transactions: 50,
                    avgSpend: 20.01
                }
            ];

            const result = await service.saveHistoricalData(testLocationId, dailyData, {});

            const dataRef = ref(rtdb, `salesData/${result.salesDataId}`);
            const snapshot = await get(dataRef);
            const savedData = snapshot.val();

            expect(typeof savedData.dailyData['2024-01-01'].revenue).toBe('number');
            expect(typeof savedData.dailyData['2024-01-01'].transactions).toBe('number');
        });

        test('should handle date format variations', async () => {
            const dailyData = [
                { date: '2024-01-01', revenue: 1000, transactions: 50, avgSpend: 20 },
                { date: '2024/01/02', revenue: 1100, transactions: 55, avgSpend: 20 },
                { date: new Date('2024-01-03'), revenue: 1200, transactions: 60, avgSpend: 20 }
            ];

            const result = await service.saveHistoricalData(testLocationId, dailyData, {});

            const dataRef = ref(rtdb, `salesData/${result.salesDataId}`);
            const snapshot = await get(dataRef);
            const savedData = snapshot.val();

            // All dates should be normalized to YYYY-MM-DD format
            expect(savedData.dailyData['2024-01-01']).toBeDefined();
            expect(savedData.dailyData['2024-01-02']).toBeDefined();
            expect(savedData.dailyData['2024-01-03']).toBeDefined();
        });
    });
});

// Helper Functions

function generateTestDailyData(days) {
    const data = [];
    const baseDate = new Date('2024-01-01');

    for (let i = 0; i < days; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);

        data.push({
            date: date.toISOString().split('T')[0],
            revenue: 1000 + Math.random() * 500,
            transactions: 50 + Math.floor(Math.random() * 25),
            avgSpend: 20
        });
    }

    return data;
}

function generateTestForecast(horizon) {
    const predictions = [];
    const baseDate = new Date('2024-02-01');

    for (let i = 0; i < horizon; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);

        predictions.push({
            date,
            revenue: 1000 + Math.random() * 200,
            transactionQty: 50 + Math.floor(Math.random() * 10),
            avgSpend: 20,
            confidenceLower: 900,
            confidenceUpper: 1300
        });
    }

    return {
        config: {
            method: 'seasonal',
            horizon,
            confidenceLevel: 95
        },
        predictions
    };
}

async function cleanupTestData(userId, locationId) {
    // Clean up salesData
    const salesDataIndexRef = ref(rtdb, `salesDataIndex/byLocation/${locationId}`);
    const salesIndexSnapshot = await get(salesDataIndexRef);

    if (salesIndexSnapshot.exists()) {
        const dataIds = Object.keys(salesIndexSnapshot.val());
        for (const id of dataIds) {
            await remove(ref(rtdb, `salesData/${id}`));
        }
        await remove(salesDataIndexRef);
    }

    // Clean up forecasts
    const forecastIndexRef = ref(rtdb, `forecastIndex/byLocation/${locationId}`);
    const forecastIndexSnapshot = await get(forecastIndexRef);

    if (forecastIndexSnapshot.exists()) {
        const forecastIds = Object.keys(forecastIndexSnapshot.val());
        for (const id of forecastIds) {
            await remove(ref(rtdb, `forecasts/${id}`));
        }
        await remove(forecastIndexRef);
    }

    // Clean up user indexes
    await remove(ref(rtdb, `salesDataIndex/byUser/${userId}`));
    await remove(ref(rtdb, `forecastIndex/byUser/${userId}`));
}
