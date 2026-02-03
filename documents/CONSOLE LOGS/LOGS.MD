17:30:30.360 service-worker.js:324 [Service Worker] Phase 3 Performance Optimization Service Worker loaded
17:30:33.785 content-scripts.js:1 CONTENT_SHELL: Page is excluded. Skipping shell protection.
17:30:33.883 content-scripts.js:1 TSS: excluded result:  true
17:30:33.904 content-scripts.js:1 SCHJK: Search Hijacking notification feature flag is enabled. true
17:30:34.006 content-scripts.js:1 Content Script Bridge: Sending response back to page context: Object
17:30:34.017 content-scripts.js:1 Content Script Bridge: Unknown message type,  MSG_CHECK_DOMAIN_ALLOW_LIST_RESPONSE
17:30:34.017 injection-tss-mv3.js:1 TSS: Domain is in allow list, skipping TSS setup.
17:30:34.682 firebase-config.js:94 Firebase config loaded and ready for use
17:30:34.684 sales-forecasting.html:1084 [SalesForecasting] Starting admin authentication...
17:30:34.743 content-scripts.js:1 DFP: Breach notification feature flag is enabled. true
17:30:35.084 sales-forecasting.html:1090 [SalesForecasting] Auth state ready, user: andreas@askgroupholdings.com
17:30:35.405 admin-claims.js:32 [AdminClaims] Starting admin verification for user: OTnjPiIxRNejaJuaxoPrbFBw3L42
17:30:35.405 admin-claims.js:40 [AdminClaims] Getting fresh ID token...
17:30:35.704 admin-claims.js:42 [AdminClaims] Successfully got fresh token
17:30:35.705 admin-claims.js:22 [AdminClaims] Functions base URL: https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net
17:30:35.705 admin-claims.js:46 [AdminClaims] Making request to: https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/verifyAdminStatus
17:30:35.705 admin-claims.js:48 [AdminClaims] Sending verification request...
17:30:41.398 admin-claims.js:58 [AdminClaims] Response received: Object
17:30:41.398 admin-claims.js:82 [AdminClaims] Parsing successful response...
17:30:41.398 admin-claims.js:84 [AdminClaims] Admin verification result: Object
17:30:41.398 sales-forecasting.html:1116 [SalesForecasting] Admin verification successful
17:30:41.399 sales-data-service.js:17 [SalesDataService] Initialized for user: OTnjPiIxRNejaJuaxoPrbFBw3L42
17:30:41.399 forecast-engine.js:11 [ForecastEngine] Initialized
17:30:41.399 forecast-analytics.js:17 [ForecastAnalytics] Initialized
17:30:57.421 sales-forecasting.html:1175 [SalesForecasting] Loaded 7 locations
17:30:59.337 sales-forecasting.html:2922 [SalesForecasting] Loaded 1 saved data sets for location
17:31:03.856 sales-forecasting.html:2940 [SalesForecasting] Loading saved forecasts for location: -OSKIKiRLR-OeWqP7ZI-
17:31:03.857 sales-data-service.js:190 [SalesDataService] Attaching real-time listener for forecasts: -OSKIKiRLR-OeWqP7ZI-
17:31:04.664 sales-data-service.js:229 [SalesDataService] Forecasts updated: 2
17:31:26.597 sales-forecasting.html:2758 [SalesForecasting] Using saved data: -OjW9vHr6dXcbWmLKTGO
17:31:26.901 sales-forecasting.html:2794 [SalesForecasting] Loaded 740 records, total transactions: 103882
17:31:26.901 sales-forecasting.html:2808 [SalesForecasting] Saved data loaded successfully: 740 records
17:31:26.903 sales-forecasting.html:2140 [SalesForecasting] Suggested growth: 11.8% based on 88 YoY matches
17:31:36.904 sales-forecasting.html:2243 [SalesForecasting] Historical viewer: showing 30 records
17:31:49.061 sales-forecasting.html:3068 [SalesForecasting] Loading forecast: -OkZ-FQ_oqguRlB6wNip
17:31:49.061 sales-data-service.js:243 [SalesDataService] Loading saved forecast: -OkZ-FQ_oqguRlB6wNip
17:31:49.323 sales-forecasting.html:2627 [SalesForecasting] Loading saved data for location: -OSKIKiRLR-OeWqP7ZI-
17:31:49.324 sales-forecasting.html:3088 [SalesForecasting] ===== LOADED FORECAST FROM FIREBASE =====
17:31:49.324 sales-forecasting.html:3089 [SalesForecasting] Forecast ID: -OkZ-FQ_oqguRlB6wNip
17:31:49.324 sales-forecasting.html:3090 [SalesForecasting] Forecast name: February Forecast 2026 - 2/3/2026
17:31:49.324 sales-forecasting.html:3091 [SalesForecasting] Raw predictions object keys: 28
17:31:49.324 sales-forecasting.html:3094 [SalesForecasting] Sample raw prediction from Firebase: {date: '2026-02-01', avgSpend: 430.98499999999996, confidenceLower: 89213.89499999999, confidenceUpper: 109039.20499999999, predicted: 99126.54999999999, …}
17:31:49.324 sales-forecasting.html:3111 [SalesForecasting] ===== RESTORED FORECAST DATA =====
17:31:49.324 sales-forecasting.html:3112 [SalesForecasting] Restored forecast rows: 28
17:31:49.324 sales-forecasting.html:3116 [SalesForecasting] Rows with transactionQty > 0: 28 / 28
17:31:49.324 sales-forecasting.html:3117 [SalesForecasting] Total transactions loaded: 4177
17:31:49.325 sales-forecasting.html:3118 [SalesForecasting] Sample restored data (first row): {date: '2026-02-01', predicted: 99126.54999999999, transactionQty: 230, avgSpend: 430.98499999999996}
17:31:49.474 sales-forecasting.html:3401 [SalesForecasting] ===== RENDERING ADJUSTMENT TABLE =====
17:31:49.474 sales-forecasting.html:3408 [SalesForecasting] Rendering 28 rows in adjustment table
17:31:49.474 sales-forecasting.html:3410 [SalesForecasting] Sample data for rendering (first row): {date: '2026-02-01', predicted: 99126.54999999999, revenue: undefined, transactionQty: 230, avgSpend: 430.98499999999996}
17:31:49.475 sales-forecasting.html:3427 [SalesForecasting] First adjustment row data: {dateStr: '2026-02-01', revenue: 99126.54999999999, transactions: 230, avgSpend: 430.98499999999996}
17:31:49.620 chart.min.js:7 [Violation] 'requestAnimationFrame' handler took 117ms
17:31:49.896 sales-data-service.js:644 [SalesDataService] Getting actuals for location: -OSKIKiRLR-OeWqP7ZI-
17:31:50.168 sales-data-service.js:654 [SalesDataService] Total actuals in database: 4
17:31:50.168 sales-data-service.js:659 [SalesDataService] Checking actual: -OkT08-PCzx_5ZyioK8q locationId: -OSKIKiRLR-OeWqP7ZI- vs -OSKIKiRLR-OeWqP7ZI-
17:31:50.433 sales-data-service.js:659 [SalesDataService] Checking actual: -OkT3NpausuYEK1MNP1R locationId: -OSKIKiRLR-OeWqP7ZI- vs -OSKIKiRLR-OeWqP7ZI-
17:31:50.688 sales-data-service.js:659 [SalesDataService] Checking actual: -OkYw9LDYGN9mXYhlikY locationId: -OSKIKiRLR-OeWqP7ZI- vs -OSKIKiRLR-OeWqP7ZI-
17:31:50.943 sales-data-service.js:659 [SalesDataService] Checking actual: -OkYxOQP2lNCGB4U7P7- locationId: -OSKIKiRLR-OeWqP7ZI- vs -OSKIKiRLR-OeWqP7ZI-
17:31:51.197 sales-data-service.js:680 [SalesDataService] Found 4 actuals for location: -OSKIKiRLR-OeWqP7ZI-
17:31:51.197 sales-forecasting.html:2663 [SalesForecasting] Retrieved saved data: 1 items
17:31:51.197 sales-forecasting.html:2664 [SalesForecasting] Retrieved actuals: 4 items
17:31:51.197 sales-forecasting.html:2665 [SalesForecasting] Actuals data: (4) [{…}, {…}, {…}, {…}]0: comparison: {bias: 3725.241583333338, dayResults: {…}, daysCompared: 30, mae: 9107.98491666667, mape: 12.994299122787492, …}dailyActuals: {2026-01-02: {…}, 2026-01-03: {…}, 2026-01-04: {…}, 2026-01-05: {…}, 2026-01-06: {…}, …}dateRange: {endDate: '2026/01/31', startDate: '2026/01/02'}forecastId: "-OkT-drTj37tX7GecTfQ"forecastName: "Grove - January Forecast - 2/2/2026"id: "-OkYxOQP2lNCGB4U7P7-"locationId: "-OSKIKiRLR-OeWqP7ZI-"recordCount: 30uploadedAt: 1770129826263uploadedBy: "OTnjPiIxRNejaJuaxoPrbFBw3L42"[[Prototype]]: Object1: comparison: {bias: -73008.63341666666, dayResults: {…}, daysCompared: 30, mae: 73008.63341666666, mape: 96502.78448469924, …}dailyActuals: {2026-01-02: {…}, 2026-01-03: {…}, 2026-01-04: {…}, 2026-01-05: {…}, 2026-01-06: {…}, …}dateRange: {endDate: '2026/01/31', startDate: '2026/01/02'}forecastId: "-OkT-drTj37tX7GecTfQ"forecastName: "Grove - January Forecast - 2/2/2026"id: "-OkYw9LDYGN9mXYhlikY"locationId: "-OSKIKiRLR-OeWqP7ZI-"recordCount: 30uploadedAt: 1770129502263uploadedBy: "OTnjPiIxRNejaJuaxoPrbFBw3L42"[[Prototype]]: Object2: comparison: {bias: -73008.63341666666, dayResults: {…}, daysCompared: 30, mae: 73008.63341666666, mape: 96502.78448469924, …}dailyActuals: {2026-01-02: {…}, 2026-01-03: {…}, 2026-01-04: {…}, 2026-01-05: {…}, 2026-01-06: {…}, …}dateRange: {endDate: '2026/01/31', startDate: '2026/01/02'}forecastId: "-OkT-drTj37tX7GecTfQ"forecastName: "Grove - January Forecast - 2/2/2026"id: "-OkT3NpausuYEK1MNP1R"locationId: "-OSKIKiRLR-OeWqP7ZI-"recordCount: 30uploadedAt: 1770030993822uploadedBy: "OTnjPiIxRNejaJuaxoPrbFBw3L42"[[Prototype]]: Object3: comparison: {bias: 76.33333333333333, dayResults: {…}, daysCompared: 30, mae: 76.33333333333333, mape: 100, …}dailyActuals: {2026-01-02: {…}, 2026-01-03: {…}, 2026-01-04: {…}, 2026-01-05: {…}, 2026-01-06: {…}, …}dateRange: {endDate: '2026/01/31', startDate: '2026/01/02'}forecastId: "-OkT-drTj37tX7GecTfQ"forecastName: "Grove - January Forecast - 2/2/2026"id: "-OkT08-PCzx_5ZyioK8q"locationId: "-OSKIKiRLR-OeWqP7ZI-"recordCount: 30uploadedAt: 1770030142602uploadedBy: "OTnjPiIxRNejaJuaxoPrbFBw3L42"[[Prototype]]: Objectlength: 4[[Prototype]]: Array(0)
17:31:51.199 sales-forecasting.html:2741 

sales-forecasting.html:2741 [SalesForecasting] Saved data list rendered successfully
17:59:32.821 sales-forecasting.html:1 Uncaught ReferenceError: deleteActuals is not defined
    at HTMLButtonElement.onclick (sales-forecasting.html:1:1)Understand this error
17:59:39.821 sales-forecasting.html:1 Uncaught ReferenceError: deleteActuals is not defined
    at HTMLButtonElement.onclick (sales-forecasting.html:1:1)Understand this error
17:59:46.089 sales-forecasting.html:1 Uncaught ReferenceError: deleteActuals is not defined
    at HTMLButtonElement.onclick (
