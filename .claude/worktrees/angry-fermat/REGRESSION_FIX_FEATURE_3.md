# Feature 3 Regression Fix: Data Persistence Issue

## Issue Summary
**Feature #3**: "Data persists across server restart" - CRITICAL FAILURE

## Root Cause Analysis

### What Was Found
1. Firebase RTDB emulator (port 9000) is **NOT running**
2. Only Vite dev server (port 5000) is running
3. Firebase emulators require **Java** but Java is not installed or not in PATH
4. Error from `firebase-emulator.log`: `Could not spawn java -version. Please make sure Java is installed and on your system PATH.`

### Impact
- Application cannot use local Firebase RTDB emulator
- Firebase config attempts to connect to `localhost:9000` but fails
- Likely falling back to production Firebase RTDB
- Data persistence cannot be tested in development environment
- This is a **CRITICAL** infrastructure issue

## Current State

### What's Running
- ✅ Vite dev server on port 5000 (`npm run dev`)
- ❌ Firebase RTDB emulator on port 9000 (NOT running)
- ❌ Firebase Functions emulator on port 5001 (NOT running)
- ❌ Firebase Hosting emulator (NOT running)

### Configuration Found
From `package.json`:
- `npm run dev` → Vite dev server only
- `npm run emulators` → Firebase emulators with data import/export

From `firebase-config.js` (lines 29-38):
```javascript
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
        connectDatabaseEmulator(rtdb, 'localhost', 9000);
        connectAuthEmulator(auth, 'http://localhost:9099');
        connectFirestoreEmulator(db, 'localhost', 8080);
        connectFunctionsEmulator(functions, 'localhost', 5001);
        console.log('✅ Connected to Firebase emulators');
    } catch (error) {
        console.warn('⚠️ Could not connect to emulators:', error.message);
    }
}
```

## Fix Required

### Step 1: Install Java
Firebase emulators require Java Runtime Environment (JRE). Install:

**Windows:**
```bash
# Download and install OpenJDK 11 or later
# https://adoptium.net/
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install openjdk-11-jre

# Mac
brew install openjdk@11
```

### Step 2: Verify Java Installation
```bash
java -version
```

Should output something like:
```
openjdk version "11.0.x" 2024-xx-xx
OpenJDK Runtime Environment (build 11.0.x+x)
```

### Step 3: Start Firebase Emulators
Instead of just running Vite, run:

```bash
# Terminal 1: Start Firebase emulators
npm run emulators

# Terminal 2: Start Vite dev server
npm run dev
```

Or use the provided `init.sh` script which starts both:
```bash
./init.sh
```

### Step 4: Verify Emulators Are Running
Check that all ports are active:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000  # Vite/Hosting: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000  # RTDB: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:5001  # Functions: 404 expected
curl -s -o /dev/null -w "%{http_code}" http://localhost:9099  # Auth: 200
```

### Step 5: Test Data Persistence
Once emulators are running, test Feature #3:

1. Create test data:
```bash
curl -X PUT 'http://localhost:9000/test.json?ns=merakicaptiveportal-firebasedb-default-rtdb' \
  -H "Content-Type: application/json" \
  -d '{"RESTART_TEST_12345":{"name":"RESTART_TEST_12345","timestamp":"'$(date +%s)'"}}'
```

2. Verify data exists:
```bash
curl -s 'http://localhost:9000/test/RESTART_TEST_12345.json?ns=merakicaptiveportal-firebasedb-default-rtdb'
```

3. Stop emulators (Ctrl+C) - data will auto-export to `./firebase-export`

4. Restart emulators:
```bash
npm run emulators
```

5. Verify data still exists (should reload from `./firebase-export`)

## Data Persistence Mechanism

From `init.sh` line 113:
```bash
firebase emulators:start --import=./firebase-export --export-on-exit
```

- `--import=./firebase-export`: Loads data from previous session on startup
- `--export-on-exit`: Saves data to `./firebase-export` on shutdown
- This provides **persistent local development data**

## Action Items

- [ ] Install Java JRE 11+
- [ ] Verify Java is in system PATH
- [ ] Start Firebase emulators with `npm run emulators`
- [ ] Verify all emulator ports are responding
- [ ] Re-test Feature #3 data persistence
- [ ] Mark Feature #3 as passing after successful verification

## Related Files
- `/firebase-emulator.log` - Shows Java error
- `/firebase.json` - Emulator port configuration
- `/public/js/config/firebase-config.js` - Client-side emulator connection
- `/init.sh` - Unified startup script
- `/package.json` - NPM scripts for dev and emulators

## Status
- **Date**: 2026-02-09
- **Tested By**: Testing Agent
- **Status**: REGRESSION IDENTIFIED - Awaiting Java installation to complete fix
