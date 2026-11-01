import { DuckDBInstance } from '@duckdb/node-api';
import { writeFile } from 'node:fs/promises';

const instance = await DuckDBInstance.create(':memory:');
const connection = await instance.connect();
try {
  await connection.run("CREATE VIEW trips AS SELECT * FROM read_parquet('public/data/trips.parquet')");
  const query = async sql => (await connection.runAndReadAll(sql)).getRowObjectsJson();
  const schema = await query('DESCRIBE trips');
  const summary = await query(`SELECT count(*) AS raw_rows,
    count(*) FILTER (WHERE tpep_pickup_datetime >= TIMESTAMP '2024-01-01'
      AND tpep_pickup_datetime < TIMESTAMP '2024-02-01') AS january_rows,
    min(tpep_pickup_datetime)::VARCHAR AS earliest_pickup,
    max(tpep_pickup_datetime)::VARCHAR AS latest_pickup FROM trips`);
  const report = { schema, summary };
  await writeFile('data/inspection.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { connection.closeSync(); instance.closeSync(); }
