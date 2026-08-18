/**
 * idbPreferences.js — IndexedDB helper for notification preferences.
 * Mirrors localStorage prefs so the service worker can read radiusKm, etc.
 */

const DB_NAME = 'disrupture_location_db';
const DB_VERSION = 2;
const STORE_NAME = 'user_preferences';
const PREFS_KEY = 'notification';

function openPreferencesDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('user_location')) {
        db.createObjectStore('user_location', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
 * Save notification preferences to IndexedDB for service worker access.
 */
export async function saveNotificationPreferences(prefs) {
  try {
    const db = await openPreferencesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: PREFS_KEY,
        radiusKm: Number(prefs.radiusKm ?? 5),
        enabled: Boolean(prefs.enabled),
        types: prefs.types ?? {},
        timestamp: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.warn('[IDBPreferences] Save failed:', error);
    return null;
  }
}

/**
 * Read cached notification preferences from IndexedDB.
 */
export async function getNotificationPreferences() {
  try {
    const db = await openPreferencesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(PREFS_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.warn('[IDBPreferences] Read failed:', error);
    return null;
  }
}
