// DuckDB reads raw columns; JavaScript independently filters and aggregates.
// This keeps the expected-answer calculation separate from generated SQL.
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFile } from 'node:fs/promises';
const instance = await DuckDBInstance.create(':memory:');
const connection = await instance.connect();
try {
  const stream = await connection.stream(`SELECT tpep_pickup_datetime::VARCHAR,
    trip_distance, fare_amount, payment_type, tip_amount, PULocationID
    FROM read_parquet('public/data/trips.parquet')`);
  let count = 0, distanceSum = 0, distanceCount = 0, fareSum = 0, cards = 0;
  let cardTips = 0, cardFares = 0, longFareSum = 0, longFareCount = 0;
  const days = new Map(), hours = new Map(), pickups = new Map();
  for (;;) {
    const chunk = await stream.fetchChunk();
    if (chunk.rowCount === 0) break;
    for (const [date, distance, fare, payment, tip, pickup] of chunk.getRows()) {
      if (date === null || date < '2024-01-01' || date >= '2024-02-01') continue;
      count++;
      const day = date.slice(0, 10), hour = Number(date.slice(11, 13));
      days.set(day, (days.get(day) ?? 0) + 1);
      hours.set(hour, (hours.get(hour) ?? 0) + 1);
      pickups.set(pickup, (pickups.get(pickup) ?? 0) + 1);
      if (distance !== null) { distanceSum += distance; distanceCount++; }
      if (fare !== null) fareSum += fare;
      if (payment === 1n) {
        cards++;
        if (fare > 0) { cardFares += fare; cardTips += tip ?? 0; }
      }
      if (distance > 10 && fare !== null) { longFareSum += fare; longFareCount++; }
    }
  }
  const scope = "tpep_pickup_datetime >= TIMESTAMP '2024-01-01' AND tpep_pickup_datetime < TIMESTAMP '2024-02-01'";
  const cases = [
    { id: 'count', question: 'How many trips had pickups in January 2024?', sql: `SELECT count(*) AS trips FROM trips WHERE ${scope}`, expected: [{ trips: String(count) }] },
    { id: 'daily', question: 'How many trips were picked up each day in January?', sql: `SELECT CAST(tpep_pickup_datetime AS DATE)::VARCHAR AS day, count(*) AS trips FROM trips WHERE ${scope} GROUP BY 1 ORDER BY 1`, expected: [...days].sort().map(([day, n]) => ({ day, trips: String(n) })) },
    { id: 'distance', question: 'What was the average recorded trip distance in January, including zero and anomalous values?', sql: `SELECT avg(trip_distance) AS average_miles FROM trips WHERE ${scope}`, expected: [{ average_miles: distanceSum / distanceCount }], tolerance: 0.000001 },
    { id: 'fare', question: 'What was the total metered fare in January, including negative adjustments?', sql: `SELECT sum(fare_amount) AS fare_dollars FROM trips WHERE ${scope}`, expected: [{ fare_dollars: fareSum }], tolerance: 0.01 },
    { id: 'cards', question: 'How many January trips were paid by credit card?', sql: `SELECT count(*) AS trips FROM trips WHERE ${scope} AND payment_type = 1`, expected: [{ trips: String(cards) }] },
    { id: 'tips', question: 'For January card trips with positive fares, what percentage of total fare was recorded as tips?', sql: `SELECT 100.0 * sum(tip_amount) / sum(fare_amount) AS tip_percent FROM trips WHERE ${scope} AND payment_type = 1 AND fare_amount > 0`, expected: [{ tip_percent: 100 * cardTips / cardFares }], tolerance: 0.000001 },
    { id: 'pickups', question: 'What were the five busiest pickup zone IDs in January? Break ties by zone ID ascending.', sql: `SELECT PULocationID AS zone_id, count(*) AS trips FROM trips WHERE ${scope} GROUP BY 1 ORDER BY trips DESC, zone_id ASC LIMIT 5`, expected: [...pickups].sort((a,b) => b[1]-a[1] || a[0]-b[0]).slice(0,5).map(([zone_id,n]) => ({ zone_id, trips: String(n) })) },
    { id: 'hours', question: 'How many January pickups occurred in each hour of the day?', sql: `SELECT CAST(extract(hour FROM tpep_pickup_datetime) AS INTEGER) AS hour, count(*) AS trips FROM trips WHERE ${scope} GROUP BY 1 ORDER BY 1`, expected: [...hours].sort((a,b) => a[0]-b[0]).map(([hour,n]) => ({ hour, trips: String(n) })) },
    { id: 'long-fare', question: 'What was the average metered fare for January trips over ten miles?', sql: `SELECT avg(fare_amount) AS average_fare FROM trips WHERE ${scope} AND trip_distance > 10`, expected: [{ average_fare: longFareSum / longFareCount }], tolerance: 0.000001 },
    { id: 'empty', question: 'List pickup zone IDs for January pickups that occurred on or after February 1, 2024.', sql: `SELECT PULocationID AS zone_id FROM trips WHERE ${scope} AND tpep_pickup_datetime >= TIMESTAMP '2024-02-01'`, expected: [] },
  ];
  await writeFile('data/golden.json', JSON.stringify(cases, null, 2) + '\n');
  console.log(`Computed ${cases.length} expected answers using JavaScript aggregation of ${count} January rows.`);
  console.log(JSON.stringify({ januaryRows: count, cards, fareSum, averageMiles: distanceSum / distanceCount }));
} finally { connection.closeSync(); instance.closeSync(); }
