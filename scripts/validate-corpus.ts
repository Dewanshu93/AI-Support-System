// npm run corpus:validate — checks corpus/ against section Q and prints the
// composition. `-- --write` regenerates the inventory table in corpus/README.md.
import fs from 'node:fs';
import {
  CORPUS_README,
  corpusComposition,
  inventoryTable,
  loadCorpus,
  validateCorpus,
  withInventory,
} from '../apps/api/src/ai/ingestion/corpus';
import { DEFAULT_CONFIG_DIR, TaxonomySchema } from '../apps/api/src/config';
import { loadYamlFile } from '../apps/api/src/config/yaml';

function main(): number {
  const taxonomy = loadYamlFile(DEFAULT_CONFIG_DIR, 'taxonomy.yaml', TaxonomySchema);
  const taxonomyDomains = new Set(taxonomy.categories.map((c) => c.domain));

  if (process.argv.includes('--write')) {
    const { docs } = loadCorpus();
    fs.writeFileSync(
      CORPUS_README,
      withInventory(fs.readFileSync(CORPUS_README, 'utf8'), inventoryTable(docs)),
    );
    console.log(`Wrote inventory of ${docs.length} documents to corpus/README.md`);
  }

  const { docs, problems } = validateCorpus({ taxonomyDomains });
  const c = corpusComposition(docs);
  console.log(
    [
      `Documents: ${c.total} (${c.active} active, ${c.superseded} superseded; IT ${c.byDomain.IT}, HR ${c.byDomain.HR})`,
      `US/UK pairs (${c.countryPairs.length}): ${c.countryPairs.join(', ')}`,
      `With tables (${c.withTables.length}): ${c.withTables.join(', ')}`,
      `Contractor-only: ${c.contractorOnly.join(', ') || 'none'}`,
      `Manager-only: ${c.managerOnly.join(', ') || 'none'}`,
    ].join('\n'),
  );
  if (problems.length > 0) {
    console.error(
      `\nCorpus is invalid (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    return 1;
  }
  console.log('\nCorpus is valid.');
  return 0;
}

process.exitCode = main();
