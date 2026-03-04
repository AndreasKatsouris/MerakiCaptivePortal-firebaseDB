/**
 * Create Test User with Role for Feature #23 Testing
 * This script creates a test user in Firebase and sets their role
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
});

const auth = admin.auth();
const db = admin.database();

async function createTestUser(email, password, role, displayName) {
  try {
    console.log(`\nCreating test user: ${email} with role: ${role}`);

    // Check if user exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`User already exists with UID: ${userRecord.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create new user
        userRecord = await auth.createUser({
          email: email,
          password: password,
          displayName: displayName,
          emailVerified: true
        });
        console.log(`Created new user with UID: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    // Set user role in database
    await db.ref(`users/${userRecord.uid}`).update({
      email: email,
      displayName: displayName,
      role: role,
      roleUpdatedAt: Date.now(),
      createdAt: userRecord.metadata.creationTime,
      updatedAt: Date.now(),
      status: 'active'
    });
    console.log(`Set role to: ${role}`);

    // Also create a subscription for the user (default free tier)
    await db.ref(`subscriptions/${userRecord.uid}`).set({
      tierId: 'professional', // Give them professional tier for testing
      startDate: Date.now(),
      renewalDate: Date.now() + (30 * 24 * 60 * 60 * 1000),
      status: 'active',
      paymentStatus: 'active',
      features: {
        receiptProcessingManual: true,
        receiptProcessingOCR: true,
        foodCostBasic: true,
        campaignsAdvanced: true,
        multiLocation: true,
        bookingManagement: true
      },
      limits: {
        locations: 10,
        guestsPerMonth: 10000,
        receiptsPerMonth: 500,
        campaignsPerMonth: 10
      }
    });
    console.log('Created subscription');

    console.log(`✓ Test user ready: ${email} / ${password} / ${role}`);
    return userRecord.uid;

  } catch (error) {
    console.error(`Error creating test user:`, error);
    throw error;
  }
}

async function main() {
  console.log('===========================================');
  console.log('Creating Test Users for Role-Based Access');
  console.log('===========================================');

  try {
    // Create test users with different roles
    const testUsers = [
      {
        email: 'owner@test.com',
        password: 'Test123!',
        role: 'restaurant_owner',
        displayName: 'Test Owner'
      },
      {
        email: 'kitchen@test.com',
        password: 'Test123!',
        role: 'kitchen_manager',
        displayName: 'Test Kitchen Manager'
      },
      {
        email: 'floor@test.com',
        password: 'Test123!',
        role: 'floor_manager',
        displayName: 'Test Floor Manager'
      },
      {
        email: 'general@test.com',
        password: 'Test123!',
        role: 'general_manager',
        displayName: 'Test General Manager'
      }
    ];

    for (const user of testUsers) {
      await createTestUser(user.email, user.password, user.role, user.displayName);
    }

    console.log('\n===========================================');
    console.log('✓ All test users created successfully!');
    console.log('===========================================');
    console.log('\nTest Credentials:');
    console.log('1. Restaurant Owner: owner@test.com / Test123!');
    console.log('2. Kitchen Manager: kitchen@test.com / Test123!');
    console.log('3. Floor Manager: floor@test.com / Test123!');
    console.log('4. General Manager: general@test.com / Test123!');
    console.log('===========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error in main:', error);
    process.exit(1);
  }
}

main();
