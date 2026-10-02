import os from 'node:os';
import { type Db, MongoClient } from 'mongodb';

export const DEFAULT_DB_NAME = 'servicedesk';

export interface Database {
  client: MongoClient;
  db: Db;
}

/**
 * Database name from the URI path (`mongodb://host/<name>?…`), else the
 * default. Parsed by hand: multi-host URIs are not valid WHATWG URLs.
 */
export function dbNameFromUri(uri: string): string {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]*)/.exec(uri);
  const name = match?.[1] ? decodeURIComponent(match[1]) : '';
  return name || DEFAULT_DB_NAME;
}

/** Connects with a bounded pool and fails fast if no server is reachable. */
export async function connectDatabase(
  uri: string,
  options: { dbName?: string; appName?: string } = {},
): Promise<Database> {
  const client = new MongoClient(uri, {
    appName: options.appName ?? 'servicedesk-api',
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10_000,
    // Driver 7 otherwise loads `os` via dynamic import(), which fails inside Jest's
    // VM and leaves the handshake without client metadata (MongoDB 8.3 rejects that).
    runtimeAdapters: { os },
  });
  await client.connect();
  return { client, db: client.db(options.dbName ?? dbNameFromUri(uri)) };
}

/** Health probe: true if the server answers a ping. Never throws. */
export async function pingDatabase(db: Db): Promise<boolean> {
  try {
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
