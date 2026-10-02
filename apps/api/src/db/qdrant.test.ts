import { ObjectId } from 'mongodb';
import {
  CHUNK_PAYLOAD_INDEXES,
  CHUNK_VECTORS,
  chunkCollectionConfig,
  chunkIdFromPointId,
  chunkPointId,
  ensureChunkCollection,
  pingQdrant,
  type QdrantLike,
} from './qdrant';
import { CHUNK_FILTER_FIELDS } from './schemas';

describe('chunk point ids', () => {
  it('maps an ObjectId to a zero-padded UUID and back', () => {
    const id = new ObjectId('65f1c2a9e4b0a1b2c3d4e5f6');
    expect(chunkPointId(id)).toBe('00000000-65f1-c2a9-e4b0-a1b2c3d4e5f6');
    expect(chunkIdFromPointId(chunkPointId(id))).toBe(id.toHexString());
  });

  it('is case-insensitive and rejects non-ObjectId input', () => {
    expect(chunkPointId('65F1C2A9E4B0A1B2C3D4E5F6')).toBe('00000000-65f1-c2a9-e4b0-a1b2c3d4e5f6');
    expect(() => chunkPointId('not-an-id')).toThrow('not an ObjectId');
    expect(() => chunkIdFromPointId('12345678-65f1-c2a9-e4b0-a1b2c3d4e5f6')).toThrow(
      'not a chunk point id',
    );
  });

  it('is unique for distinct ObjectIds', () => {
    const ids = Array.from({ length: 100 }, () => chunkPointId(new ObjectId()));
    expect(new Set(ids).size).toBe(100);
  });
});

describe('chunk collection config', () => {
  it('uses cosine dense vectors of the configured size and BM25 sparse vectors with IDF', () => {
    expect(chunkCollectionConfig(768)).toEqual({
      vectors: { dense: { size: 768, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    });
  });

  it('indexes every access-filter field plus documentId', () => {
    expect(CHUNK_PAYLOAD_INDEXES).toEqual([...CHUNK_FILTER_FIELDS, 'documentId']);
  });
});

/** In-memory stand-in for the Qdrant client, recording calls. */
function fakeQdrant(initial?: { size?: number; sparse?: boolean; payload?: string[] }) {
  let collection = initial && {
    size: initial.size,
    sparse: initial.sparse ?? true,
    payload: new Set(initial.payload ?? []),
  };
  const calls: string[] = [];
  const client = {
    collectionExists: async () => ({ exists: !!collection }),
    createCollection: async (_name: string, config: ReturnType<typeof chunkCollectionConfig>) => {
      calls.push('createCollection');
      collection = {
        size: config.vectors[CHUNK_VECTORS.dense]!.size,
        sparse: !!config.sparse_vectors[CHUNK_VECTORS.sparse],
        payload: new Set(),
      };
      return true;
    },
    getCollection: async () => ({
      config: {
        params: {
          vectors: collection!.size === undefined ? {} : { dense: { size: collection!.size } },
          sparse_vectors: collection!.sparse ? { bm25: {} } : {},
        },
      },
      payload_schema: Object.fromEntries([...collection!.payload].map((f) => [f, {}])),
    }),
    createPayloadIndex: async (_name: string, { field_name }: { field_name: string }) => {
      calls.push(`index:${field_name}`);
      collection!.payload.add(field_name);
      return { operation_id: 1, status: 'completed' };
    },
    getCollections: async () => ({ collections: [] }),
  };
  return { client: client as unknown as QdrantLike, calls };
}

describe('ensureChunkCollection', () => {
  it('creates the collection and every payload index, then nothing on a re-run', async () => {
    const { client, calls } = fakeQdrant();
    const first = await ensureChunkCollection(client, 768);
    expect(first.collectionCreated).toBe(true);
    expect(first.payloadIndexesCreated).toEqual(CHUNK_PAYLOAD_INDEXES.map((f) => `chunks.${f}`));
    expect(calls[0]).toBe('createCollection');

    const second = await ensureChunkCollection(client, 768);
    expect(second).toEqual({ collectionCreated: false, payloadIndexesCreated: [] });
  });

  it('creates only missing payload indexes', async () => {
    const { client, calls } = fakeQdrant({ size: 768, payload: ['countries', 'status'] });
    const result = await ensureChunkCollection(client, 768);
    expect(result.collectionCreated).toBe(false);
    expect(calls).toEqual([
      'index:employmentTypes',
      'index:accessLevel',
      'index:domain',
      'index:documentId',
    ]);
  });

  it('refuses a dense dimension that differs from config', async () => {
    const { client } = fakeQdrant({ size: 3072 });
    await expect(ensureChunkCollection(client, 768)).rejects.toThrow(
      /dense size 3072 but config\/models\.yaml says 768.*full re-index/s,
    );
  });

  it('refuses a collection without the BM25 sparse vector', async () => {
    const { client } = fakeQdrant({ size: 768, sparse: false });
    await expect(ensureChunkCollection(client, 768)).rejects.toThrow('no "bm25" sparse vector');
  });
});

describe('pingQdrant', () => {
  it('reports reachability without throwing', async () => {
    await expect(
      pingQdrant({ getCollections: async () => ({ collections: [] }) } as never),
    ).resolves.toBe(true);
    await expect(
      pingQdrant({
        getCollections: async () => Promise.reject(new Error('ECONNREFUSED')),
      } as never),
    ).resolves.toBe(false);
  });
});
