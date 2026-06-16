import { STORAGE_KEY, DB_NAME, DB_STORE, normalizeState, DEFAULT_STATE, clone } from "./state.js";

let storageBackend = "memory";

export function getStorageBackend() {
  return storageBackend;
}

export const storage = {
  _dbPromise: null,

  async openDb() {
    if (!("indexedDB" in window)) return null;
    if (!this._dbPromise) {
      this._dbPromise = new Promise((resolve) => {
        let request;
        try {
          request = indexedDB.open(DB_NAME, 1);
        } catch {
          resolve(null);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        request.onerror = () => resolve(null);
      });
    }
    return this._dbPromise;
  },

  async readFromIndexedDb() {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get("state");
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  },

  async writeToIndexedDb(state) {
    const db = await this.openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const req = store.put({ key: "state", value: state });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  },

  readFromLocalStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  writeToLocalStorage(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  },

  async load() {
    const idbState = await this.readFromIndexedDb();
    if (idbState) {
      storageBackend = "indexeddb";
      return normalizeState(idbState);
    }
    const localState = this.readFromLocalStorage();
    if (localState) {
      storageBackend = "localStorage";
      return normalizeState(localState);
    }
    storageBackend = "memory";
    return clone(DEFAULT_STATE);
  },

  async save(state) {
    const next = normalizeState(state);
    const saved = await this.writeToIndexedDb(next);
    if (saved) {
      storageBackend = "indexeddb";
      return;
    }
    storageBackend = this.writeToLocalStorage(next) ? "localStorage" : "memory";
  },

  async clear() {
    const db = await this.openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const store = tx.objectStore(DB_STORE);
        const req = store.delete("state");
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore localStorage failures
    }
  },

  async describeBackend() {
    const db = await this.openDb();
    if (db) return "indexeddb";
    try {
      window.localStorage.getItem(STORAGE_KEY);
      return "localStorage";
    } catch {
      return "memory";
    }
  },
};
