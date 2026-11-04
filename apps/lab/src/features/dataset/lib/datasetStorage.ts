import { datasetMetadata } from './featureSchema'
import { validateMetadata, validateSample } from './datasetValidation'
import type { ExpressionLabel, FacialExpressionSample } from '../types/dataset'

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed.'))
  })
}

export function createDatasetStorage(name = 'interview-mirror-facial-dataset') {
  let connection: Promise<IDBDatabase> | null = null
  function open(): Promise<IDBDatabase> {
    if (connection) return connection
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable in this browser.'))
        return
      }
      const operation = indexedDB.open(name, 2)
      let blocked = false
      operation.onupgradeneeded = (event) => {
        const db = operation.result
        if (event.oldVersion > 0) {
          // Database v2 only renames the label. Dataset/feature schemas stay v1;
          // IDs, sessions, coefficients, source and timestamps remain untouched.
          const cursor = operation.transaction!.objectStore('samples').openCursor()
          cursor.onsuccess = () => {
            const row = cursor.result
            if (!row) return
            const value = row.value as Record<string, unknown>
            if (value.label === 'frown') row.update({ ...value, label: 'angry' })
            row.continue()
          }
          return
        }
        const store = db.createObjectStore('samples', { keyPath: 'id' })
        for (const field of ['participantId', 'sessionId', 'label', 'source'])
          store.createIndex(field, field)
        db.createObjectStore('metadata').add(datasetMetadata(), 'dataset')
      }
      operation.onsuccess = () => {
        const db = operation.result
        if (blocked) {
          db.close()
          return
        }
        db.onclose = () => {
          connection = null
        }
        db.onversionchange = () => {
          db.close()
          connection = null
        }
        resolve(db)
      }
      operation.onerror = () =>
        reject(operation.error ?? new Error('Cannot open local dataset storage.'))
      operation.onblocked = () => {
        blocked = true
        reject(
          new Error(
            'Dataset storage is blocked by another tab. Close other ExpressionLens tabs and retry.',
          ),
        )
      }
    }).catch((error: unknown) => {
      connection = null
      throw error
    })
    return connection
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await open()
    const tx = db.transaction(['samples', 'metadata'], mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('Local dataset transaction was aborted.'))
      tx.onerror = () => {
        /* onabort reports the final failure */
      }
    })
    // Attach a rejection handler immediately, including while requests are pending.
    void done.catch(() => {})
    try {
      validateMetadata(await request(tx.objectStore('metadata').get('dataset')))
      const result = await work(tx.objectStore('samples'))
      await done
      return result
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* already completed or aborted */
      }
      await done.catch(() => {})
      throw error
    }
  }

  return {
    async all(): Promise<FacialExpressionSample[]> {
      return transaction('readonly', async (store) =>
        (await request<unknown[]>(store.getAll())).map(validateSample),
      )
    },
    async add(samples: readonly FacialExpressionSample[]): Promise<void> {
      const clean = samples.map(validateSample)
      const ids = new Set(clean.map((sample) => sample.id))
      if (ids.size !== clean.length)
        throw new Error('Duplicate sample IDs in this batch. Nothing was saved.')
      await transaction('readwrite', async (store) => {
        // add(), never put(): concurrent imports cannot overwrite existing samples.
        for (const sample of clean) await request(store.add(sample))
      })
    },
    async update(
      id: string,
      changes: { label: ExpressionLabel; participantId: string },
    ): Promise<void> {
      await transaction('readwrite', async (store) => {
        const previous: unknown = await request(store.get(id))
        if (!previous) throw new Error('This sample no longer exists. Refresh the dataset.')
        const sample = validateSample({ ...validateSample(previous), ...changes })
        await request(store.put(sample))
      })
    },
    async remove(id: string): Promise<void> {
      await transaction('readwrite', async (store) => {
        await request(store.delete(id))
      })
    },
    async clear(): Promise<void> {
      await transaction('readwrite', async (store) => {
        await request(store.clear())
      })
    },
    async close(): Promise<void> {
      ;(await connection)?.close()
      connection = null
    },
  }
}
export const datasetStorage = createDatasetStorage()

export function storageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return 'Device storage is full. Export a backup and free space before saving more samples.'
  if (error instanceof DOMException && error.name === 'ConstraintError')
    return 'A sample ID already exists. Nothing was overwritten; refresh the import summary and retry.'
  return error instanceof Error
    ? error.message
    : 'Local storage failed. Check browser storage permissions or private browsing restrictions.'
}
