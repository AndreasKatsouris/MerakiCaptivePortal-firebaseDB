/**
 * Firebase Configuration for Utility Functions
 * Version: 1.0.0-2025-07-17
 * 
 * Provides Firebase configuration for utility functions
 * Uses existing Firebase Admin configuration
 */

const { rtdb, ref, get, set, update, push, remove } = require('../config/firebase-admin');

// Server timestamp function
const serverTimestamp = () => {
  return require('firebase-admin').database.ServerValue.TIMESTAMP;
};

module.exports = {
  rtdb,
  ref,
  get,
  set,
  update,
  push,
  remove,
  serverTimestamp
};