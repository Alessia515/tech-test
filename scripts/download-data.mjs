import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = 'https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet';
const target = new URL('../public/data/trips.parquet', import.meta.url);
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
const response = await fetch(url);
if (!response.ok) throw new Error(`Dataset download failed: ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (data.length < 5_000_000 || data.length > 50_000_000) {
  throw new Error(`Unexpected dataset size: ${data.length} bytes`);
}
if (data.subarray(0, 4).toString() !== 'PAR1' || data.subarray(-4).toString() !== 'PAR1') {
  throw new Error('Download is not a Parquet file');
}
const sha256 = createHash('sha256').update(data).digest('hex');
const manifestPath = new URL('../data/manifest.json', import.meta.url);
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!manifest && !process.argv.includes('--record-manifest')) {
  throw new Error('Missing manifest; initial maintainer download requires --record-manifest');
}
if (manifest && (manifest.sha256 !== sha256 || manifest.bytes !== data.length)) {
  throw new Error('Dataset checksum/size changed; inspect source before updating the manifest');
}
const temporary = new URL('../public/data/trips.parquet.tmp', import.meta.url);
try {
  await writeFile(temporary, data);
  await rename(temporary, target);
} finally { await rm(temporary, { force: true }); }
if (!manifest) {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({ url, bytes: data.length, sha256 }, null, 2) + '\n');
}
console.log(JSON.stringify({ bytes: data.length, sha256, file: 'public/data/trips.parquet' }, null, 2));
