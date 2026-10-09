type RecordsWithIds<T> = { [K in keyof T]: { id: string } };
type StoreName<T> = Extract<keyof T, string>;

export interface StoreSchema<T> {
  name: StoreName<T>;
  indexes?: readonly { name: string; keyPath: string }[];
}

export interface DatabaseOptions<T> {
  name: string;
  version: number;
  stores: readonly StoreSchema<T>[];
  /** Bootstrap identity, independent of IndexedDB schema version. */
  seedVersion?: string;
  /** One-time development reset of all owner stores when the old unversioned marker exists. */
  replaceLegacySeed?: boolean;
  seed: () => { [K in keyof T]: readonly T[K][] };
}

/** Low-level store operations. Application repositories keep this client private. */
export interface DatabaseClient<T> {
  initialize(): Promise<void>;
  list<K extends StoreName<T>>(store: K): Promise<T[K][]>;
  get<K extends StoreName<T>>(store: K, id: string): Promise<T[K] | undefined>;
  listByIndex<K extends StoreName<T>>(
    store: K,
    index: string,
    key: string,
  ): Promise<T[K][]>;
  add<K extends StoreName<T>>(store: K, record: T[K]): Promise<void>;
  put<K extends StoreName<T>>(store: K, record: T[K]): Promise<void>;
  putSequenced<K extends StoreName<T>>(
    store: K,
    record: T[K],
    field: Extract<keyof T[K], string>,
  ): Promise<void>;
  delete<K extends StoreName<T>>(store: K, id: string): Promise<void>;
  close(): Promise<void>;
}

const metadataStore = '_metadata';
const seedMarker = 'fixtures-initialized';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => {
      /* Abort reports the final transaction failure. */
    };
  });
}

/** One owner supplies its schema and seeds; this package contains no business store names. */
export function createDatabase<T extends RecordsWithIds<T>>(
  options: DatabaseOptions<T>,
): DatabaseClient<T> {
  let connection: Promise<IDBDatabase> | undefined;

  async function open(): Promise<IDBDatabase> {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(options.name, options.version);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(metadataStore))
          db.createObjectStore(metadataStore, { keyPath: 'id' });
        for (const schema of options.stores) {
          const store = db.objectStoreNames.contains(schema.name)
            ? request.transaction?.objectStore(schema.name)
            : db.createObjectStore(schema.name, { keyPath: 'id' });
          for (const index of schema.indexes ?? []) {
            if (store && !store.indexNames.contains(index.name))
              store.createIndex(index.name, index.keyPath);
          }
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open IndexedDB'));
      request.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            'Database upgrade is blocked; close older application tabs',
          ),
        );
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    });
    try {
      return await connection;
    } catch (error) {
      connection = undefined;
      throw error;
    }
  }

  async function initialize(): Promise<void> {
    const db = await open();
    const names = options.stores.map((store) => store.name);
    // A single readwrite transaction serializes simultaneous initialization across tabs.
    const transaction = db.transaction([...names, metadataStore], 'readwrite');
    const done = transactionDone(transaction);
    try {
      const metadata = transaction.objectStore(metadataStore);
      const marker: unknown = await requestResult(metadata.get(seedMarker));
      const version =
        typeof marker === 'object' && marker !== null && 'version' in marker
          ? marker.version
          : undefined;
      const migrateLegacy = Boolean(
        marker &&
        version === undefined &&
        options.replaceLegacySeed &&
        options.seedVersion,
      );
      if (
        marker &&
        version !== undefined &&
        options.seedVersion &&
        version !== options.seedVersion
      )
        throw new Error(
          'Unsupported fixture version; an explicit migration is required',
        );
      if (!marker || migrateLegacy) {
        const counts = await Promise.all(
          names.map((name) =>
            requestResult(transaction.objectStore(name).count()),
          ),
        );
        // Preserve pre-existing data even if its marker is missing; never overwrite edits.
        if (migrateLegacy || counts.every((count) => count === 0)) {
          const fixtures = options.seed();
          if (migrateLegacy)
            for (const name of names) transaction.objectStore(name).clear();
          for (const name of names) {
            for (const record of fixtures[name])
              transaction.objectStore(name).add(record);
          }
        }
        metadata.put({
          id: seedMarker,
          ...(options.seedVersion ? { version: options.seedVersion } : {}),
        });
      }
      await done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* It may already have aborted. */
      }
      await done.catch(() => undefined);
      throw error;
    }
  }

  let initialization: Promise<void> | undefined;
  async function ready(): Promise<IDBDatabase> {
    initialization ??= initialize().catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
    await initialization;
    return open();
  }

  async function read<R>(
    store: StoreName<T>,
    operation: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await ready();
    const transaction = db.transaction(store, 'readonly');
    const done = transactionDone(transaction);
    const result = requestResult(operation(transaction.objectStore(store)));
    const [value] = await Promise.all([result, done]);
    return value;
  }

  async function write(
    store: StoreName<T>,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<void> {
    const db = await ready();
    const transaction = db.transaction(store, 'readwrite');
    const done = transactionDone(transaction);
    operation(transaction.objectStore(store));
    await done;
  }

  return {
    initialize: async () => {
      await ready();
    },
    list: (store) => read(store, (objectStore) => objectStore.getAll()),
    get: (store, id) => read(store, (objectStore) => objectStore.get(id)),
    listByIndex: (store, index, key) =>
      read(store, (objectStore) => objectStore.index(index).getAll(key)),
    add: (store, record) =>
      write(store, (objectStore) => objectStore.add(record)),
    put: (store, record) =>
      write(store, (objectStore) => objectStore.put(record)),
    putSequenced: async (store, record, field) => {
      const db = await ready();
      const transaction = db.transaction([store, metadataStore], 'readwrite');
      const done = transactionDone(transaction);
      try {
        const metadata = transaction.objectStore(metadataStore);
        const id = `sequence:${store}:${field}`;
        const previous: unknown = await requestResult(metadata.get(id));
        const sequence =
          typeof previous === 'object' &&
          previous !== null &&
          'value' in previous &&
          typeof previous.value === 'number'
            ? previous.value
            : 0;
        if (
          !Number.isSafeInteger(sequence) ||
          sequence < 0 ||
          sequence >= Number.MAX_SAFE_INTEGER
        )
          throw new Error('Invalid persisted edit sequence');
        metadata.put({ id, value: sequence + 1 });
        transaction
          .objectStore(store)
          .put({ ...record, [field]: sequence + 1 });
        await done;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          /* Already completed/aborted. */
        }
        await done.catch(() => undefined);
        throw error;
      }
    },
    delete: (store, id) =>
      write(store, (objectStore) => objectStore.delete(id)),
    close: async () => {
      if (connection) (await connection).close();
      connection = undefined;
      initialization = undefined;
    },
  };
}
