import { saveNotificationPreferences } from './idbPreferences';

const PERSONA_LS_KEY = 'disrupturePersona';
const DB_NAME = 'disrupture_location_db';
const DB_VERSION = 2;
const STORE_NAME = 'user_preferences';
const PERSONA_IDB_KEY = 'persona';

function openPreferencesDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
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
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function readLocalPersona() {
  try {
    const v = window.localStorage.getItem(PERSONA_LS_KEY);
    if (v === 'kantor' || v === 'ojek' || v === 'rumah') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalPersona(id) {
  try {
    if (id) window.localStorage.setItem(PERSONA_LS_KEY, id);
    else window.localStorage.removeItem(PERSONA_LS_KEY);
  } catch {
    /* ignore */
  }
}

async function readIdbPersona() {
  try {
    const db = await openPreferencesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(PERSONA_IDB_KEY);
      req.onsuccess = () => {
        const id = req.result?.personaId;
        resolve(id === 'kantor' || id === 'ojek' || id === 'rumah' ? id : null);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

async function writeIdbPersona(id) {
  try {
    const db = await openPreferencesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ id: PERSONA_IDB_KEY, personaId: id, timestamp: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return false;
  }
}

export async function getPersona() {
  const fromIdb = await readIdbPersona();
  if (fromIdb) return fromIdb;
  return readLocalPersona();
}

export async function savePersona(id, notificationPrefs = null) {
  if (id !== 'kantor' && id !== 'ojek' && id !== 'rumah') return null;
  writeLocalPersona(id);
  await writeIdbPersona(id);
  if (notificationPrefs) {
    await saveNotificationPreferences(notificationPrefs);
  }
  return id;
}

export async function clearPersona() {
  writeLocalPersona(null);
  try {
    const db = await openPreferencesDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(PERSONA_IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    /* ignore */
  }
}
