// Explicit canned UI/API checks. Not an LLM, and not retrieval-quality evidence.
const month = "tpep_pickup_datetime >= TIMESTAMP '2024-01-01' AND tpep_pickup_datetime < TIMESTAMP '2024-02-01'";
export const fixtures = [
  { question: 'How many trips had pickups in January 2024?', sql: `SELECT COUNT(*) AS trips FROM trips WHERE ${month}`, rationale: 'Counts trips with pickups in January; fixture response, no model called.' },
  { question: 'What was the average recorded trip distance in January?', sql: `SELECT AVG(trip_distance) AS average_miles FROM trips WHERE ${month}`, rationale: 'Averages recorded miles without silently cleaning values; fixture response.' },
  { question: 'How many January trips were paid by credit card?', sql: `SELECT COUNT(*) AS trips FROM trips WHERE ${month} AND payment_type=1`, rationale: 'Counts January trips with credit-card payment code 1; fixture response.' },
  { question: 'What was the total metered fare in January?', sql: `SELECT SUM(fare_amount) AS fare_dollars FROM trips WHERE ${month}`, rationale: 'Sums recorded metered fares including signed adjustments; fixture response.' },
  { question: 'What were the five busiest pickup zone IDs in January?', sql: `SELECT PULocationID AS zone_id, COUNT(*) AS trips FROM trips WHERE ${month} GROUP BY 1 ORDER BY trips DESC, zone_id ASC LIMIT 5`, rationale: 'Ranks numeric pickup zone IDs by January trip count; fixture response.' },
];
export function fixtureAnswer(question: string) {
  return fixtures.find(item => item.question.toLowerCase() === question.trim().toLowerCase());
}
