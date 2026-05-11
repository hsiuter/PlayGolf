import { createInitialState } from "./initialData";
import type { AppState } from "./types";

const DB_NAME = "play-golf-db";
const DB_VERSION = 1;
const STORE = "state";
const KEY = "current";
const FALLBACK_KEY = "play-golf-state";

export async function loadState(): Promise<AppState> {
  try {
    const db = await openDb();
    const state = await tx<AppState | undefined>(db, "readonly", (store) => store.get(KEY));
    if (state?.schemaVersion === 1) return state;
  } catch {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  }

  const initial = createInitialState();
  await saveState(initial);
  return initial;
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await openDb();
    await tx<IDBValidKey>(db, "readwrite", (store) => store.put(state, KEY));
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
