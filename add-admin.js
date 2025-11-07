#!/usr/bin/env node

/**
 * Add Admin User Script
 * Run this once to add your email as admin
 *
 * Usage: node add-admin.js
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin SDK
// This uses Application Default Credentials from Firebase CLI
try {
  admin.initializeApp({
    projectId: 'spectralysium-volumetric-demo'
  });
  console.log('✓ Firebase Admin initialized');
} catch (error) {
  console.error('✗ Failed to initialize Firebase Admin:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function addAdmin(email) {
  try {
    // Add admin document to Firestore
    await db.collection('admins').doc(email).set({
      email: email,
      role: 'admin',
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`\n✓ SUCCESS! ${email} has been added as admin\n`);
    console.log('You can now:');
    console.log('1. Sign in at: https://spectralysium-volumetric-demo.web.app');
    console.log('2. Access admin console at: /admin');
    console.log('\n⚠️  Remember to delete setup-admin.html for security!\n');

    return true;
  } catch (error) {
    console.error('\n✗ Failed to add admin:', error.message);
    return false;
  }
}

async function listAdmins() {
  try {
    const adminsSnapshot = await db.collection('admins').get();

    if (adminsSnapshot.empty) {
      console.log('\nNo admins found in database.');
      return;
    }

    console.log('\n📋 Current Admins:');
    console.log('─'.repeat(50));
    adminsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  ${doc.id}`);
      console.log(`  Role: ${data.role}`);
      console.log(`  Added: ${data.addedAt ? data.addedAt.toDate().toLocaleString() : 'Unknown'}`);
      console.log('─'.repeat(50));
    });
  } catch (error) {
    console.error('Failed to list admins:', error.message);
  }
}

// Main function
async function main() {
  console.log('\n🔐 Volumetrik Admin Setup\n');

  // First, show existing admins
  await listAdmins();

  // Ask for email
  rl.question('\nEnter admin email address (or press Enter for default): ', async (input) => {
    const email = input.trim() || 'raiyan@spectralysium.com';

    // Validate email format
    if (!email.includes('@')) {
      console.error('✗ Invalid email address');
      rl.close();
      process.exit(1);
    }

    console.log(`\nAdding ${email} as admin...`);

    const success = await addAdmin(email);

    rl.close();
    process.exit(success ? 0 : 1);
  });
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
