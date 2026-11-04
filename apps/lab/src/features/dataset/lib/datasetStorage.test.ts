import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatasetStorage, storageError } from './datasetStorage'
import { sample } from '../test/fixtures'

const stores: ReturnType<typeof createDatasetStorage>[] = []
function store(name: string = crypto.randomUUID()) {
  const storage = createDatasetStorage(`test-dataset-${name}`)
  stores.push(storage)
  return storage
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((storage) => storage.close()))
})

describe('IndexedDB persistence', () => {
  it('persists metadata and samples through closing and reopening', async () => {
    const db = store()
    await db.add([sample()])
    await db.close()
    expect(await db.all()).toEqual([sample()])
  })
  it('edits only the allowed fields, preserving identity and original metadata', async () => {
    const db = store()
    await db.add([sample()])
    await db.update('sample-1', { label: 'angry', participantId: 'person-2' })
    expect(await db.all()).toEqual([sample({ label: 'angry', participantId: 'person-2' })])
  })
  it('atomically rejects duplicate-ID collisions without overwriting or partial insertion', async () => {
    const db = store()
    await db.add([sample()])
    await expect(db.add([sample({ id: 'new' }), sample({ label: 'smile' })])).rejects.toThrow()
    expect(await db.all()).toEqual([sample()])
    await expect(db.add([sample({ id: 'new' }), sample({ id: 'new' })])).rejects.toThrow(
      'Duplicate',
    )
    expect(await db.all()).toEqual([sample()])
  })
  it('rejects invalid features and edits, without corrupting existing records', async () => {
    const db = store()
    await db.add([sample()])
    await expect(db.add([sample({ id: '2', features: [] })])).rejects.toThrow()
    await expect(db.update('sample-1', { label: 'neutral', participantId: '' })).rejects.toThrow()
    await expect(
      db.update('missing', { label: 'neutral', participantId: 'person-1' }),
    ).rejects.toThrow('no longer exists')
    expect(await db.all()).toEqual([sample()])
  })
  it('deletes individual samples and clears remaining samples while retaining schema metadata', async () => {
    const db = store()
    await db.add([sample(), sample({ id: '2' })])
    await db.remove('sample-1')
    expect((await db.all()).map((row) => row.id)).toEqual(['2'])
    await db.clear()
    expect(await db.all()).toEqual([])
    await db.add([sample()])
    expect(await db.all()).toEqual([sample()])
  })
  it('rolls back when storage quota fails and provides an actionable message', async () => {
    const db = store()
    await db.all()
    const failure = new DOMException('Storage full', 'QuotaExceededError')
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw failure
    })
    await expect(db.add([sample()])).rejects.toThrow('Storage full')
    expect(storageError(failure)).toContain('storage is full')
    expect(await db.all()).toEqual([])
  })
})

it('upgrades existing IndexedDB v1 frown records in place without changing IDs or feature schema', async () => {
  const name = `legacy-${crypto.randomUUID()}`
  const rawName = `test-dataset-${name}`
  await new Promise<void>((resolve, reject) => {
    const operation = indexedDB.open(rawName, 1)
    operation.onupgradeneeded = () => {
      operation.result.createObjectStore('samples', { keyPath: 'id' })
      operation.result.createObjectStore('metadata')
    }
    operation.onerror = () => reject(operation.error)
    operation.onsuccess = async () => {
      const db = operation.result
      const { datasetMetadata } = await import('./featureSchema')
      const tx = db.transaction(['samples', 'metadata'], 'readwrite')
      tx.objectStore('samples').add({ ...sample(), label: 'frown' })
      tx.objectStore('metadata').add(datasetMetadata(), 'dataset')
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error)
      }
    }
  })
  const db = store(name)
  expect(await db.all()).toEqual([sample({ label: 'angry' })])
  await db.close()
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const operation = indexedDB.open(rawName)
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error)
  })
  expect(raw.version).toBe(2)
  const row = await new Promise<unknown>((resolve, reject) => {
    const operation = raw.transaction('samples', 'readonly').objectStore('samples').get('sample-1')
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error)
  })
  expect(row).toEqual(sample({ label: 'angry' }))
  raw.close()
})
