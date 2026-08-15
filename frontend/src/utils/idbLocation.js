/**
 * idbLocation.js — Zero-dependency IndexedDB helper for user location caching.
 * Accessible from both Window context (App.jsx) and Service Worker context (sw.js).
 */

export const DB_NAME = 'disrupture_location_db';
export const DB_VERSION = 2;
const LOCATION_STORE = 'user_location';
const PREFERENCES_STORE = 'user_preferences';
const LOCATION_KEY = 'latest';

export function openDisruptureDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LOCATION_STORE)) {
        db.createObjectStore(LOCATION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
        db.createObjectStore(PREFERENCES_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Save user position { lat, lng, timestamp } to IndexedDB.
 */
export async function saveUserLocation({ lat, lng, timestamp = Date.now() }) {
  try {
    const db = await openDisruptureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCATION_STORE, 'readwrite');
      const store = tx.objectStore(LOCATION_STORE);
      const record = {
        id: LOCATION_KEY,
        lat: Number(lat),
        lng: Number(lng),
        timestamp: Number(timestamp),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.warn('[IDBLocation] Save failed:', error);
    return null;
  }
}

/**
 * Read cached user location { id, lat, lng, timestamp } from IndexedDB.
 */
export async function getUserLocation() {
  try {
    const db = await openDisruptureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCATION_STORE, 'readonly');
      const store = tx.objectStore(LOCATION_STORE);
      const req = store.get(LOCATION_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.warn('[IDBLocation] Read failed:', error);
    return null;
  }
}
