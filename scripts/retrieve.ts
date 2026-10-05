// npm run retrieve -- --user <email> [--domain IT|HR] "<question>"
// Profile-safe hybrid retrieval against the real index, printed as a table.
import { DomainSchema } from '@sd/shared';
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase, createQdrantClient, getCollections } from '../apps/api/src/db';
import { createEmbeddings, embedQuery } from '../apps/api/src/ai/llm';
import { retrieve } from '../apps/api/src/ai/retrieval/retrieve';
import { mongoDocumentsRepository } from '../apps/api/src/modules/documents/repository';
import { mongoUsersRepository } from '../apps/api/src/modules/users/repository';

function parseArgs(argv: string[]) {
  const out: { user?: string; domain?: string; query: string[] } = { query: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--user') out.user = argv[++i];
    else if (argv[i] === '--domain') out.domain = argv[++i];
    else out.query.push(argv[i]!);
  }
  return out;
}

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const query = args.query.join(' ').trim();
  if (!args.user || !query) {
    console.error('Usage: npm run retrieve -- --user <email> [--domain IT|HR] "<question>"');
    return 1;
  }
  const domain = args.domain ? DomainSchema.parse(args.domain.toUpperCase()) : undefined;

  loadDotEnv();
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error:\n${err.message}`);
      return 1;
    }
    throw err;
  }

  const { client, db } = await connectDatabase(config.env.MONGODB_URI, { appName: 'retrieve' });
  try {
    const collections = getCollections(db);
    const user = await mongoUsersRepository(collections.users).findByEmail(args.user);
    if (!user) {
      console.error(`No user ${args.user}; run npm run seed`);
      return 1;
    }
    const profile = {
      country: user.country,
      employmentType: user.employmentType,
      accessLevel: user.accessLevel,
    };
    const embeddings = createEmbeddings(config.models, config.env, 'query');
    const repo = mongoDocumentsRepository(collections);
    const started = Date.now();
    const { candidates, trace } = await retrieve(
      { query, profile, domainHint: domain },
      {
        qdrant: createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY),
        embedQuery: (text) =>
          embedQuery(embeddings, text, {
            policy: config.models.call,
            dimension: config.models.embeddings.dimension,
          }),
        loadChunks: (ids) => repo.findChunksByIds(ids),
        params: config.thresholds.retrieval,
        onViolation: (v) => console.error(`ACCESS_FILTER_VIOLATION ${JSON.stringify(v)}`),
        onDomainHintDropped: (d) =>
          console.log(`(domain hint ${d} returned nothing; searched all domains)`),
      },
    );

    console.log(
      `\n"${query}" as ${user.name} (${profile.country}, ${profile.employmentType}, ${profile.accessLevel})` +
        `${domain ? `, domain hint ${domain}` : ''} — ${Date.now() - started} ms\n`,
    );
    console.log(
      `${pad('#', 3)}${pad('fused', 9)}${pad('vec', 5)}${pad('kw', 5)}${pad('document', 32)}section`,
    );
    for (const c of candidates) {
      console.log(
        `${pad(String(c.rank), 3)}${pad(c.fusedScore.toFixed(4), 9)}${pad(c.vector ? String(c.vector.rank) : '-', 5)}` +
          `${pad(c.keyword ? String(c.keyword.rank) : '-', 5)}${pad(c.chunk.docSlug, 32)}${c.chunk.sectionPath.join(' > ')}`,
      );
    }
    console.log(
      `\nvector ${trace.vector.length}, keyword ${trace.keyword.length}, fused ${trace.fused.length}, ` +
        `violations ${trace.violations.length}, missing ${trace.missing.length}`,
    );
    return trace.violations.length === 0 ? 0 : 1;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
