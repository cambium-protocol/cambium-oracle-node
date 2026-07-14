import { MRVReading } from '../../connectors/types';

export interface CircuitInput {
  project_id_hash: string;
  period_start: number;
  period_end: number;
  claimed_amount: number;
  methodology_version: number;
  sensor_readings: number[];
  reading_timestamps: number[];
  num_readings: number;
  reduction_amount: number;
}

interface VM0007Config {
  maxReadings: number;
  scalingFactor: number;
}

const DEFAULT_CONFIG: VM0007Config = {
  maxReadings: 32,
  scalingFactor: 1_000_000,
};

export function computeReduction(readings: MRVReading[]): number {
  if (readings.length === 0) {
    return 0;
  }
  let total = 0;
  for (const r of readings) {
    if (r.value < 0) {
      throw new Error(`Negative reading value: ${r.value}`);
    }
    total += r.value;
  }
  return total;
}

export function buildCircuitInput(
  projectIdHash: string,
  readings: MRVReading[],
  config: VM0007Config = DEFAULT_CONFIG,
): CircuitInput {
  if (readings.length > config.maxReadings) {
    throw new Error(
      `Too many readings: ${readings.length} > max ${config.maxReadings}`,
    );
  }

  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const periodStart = sorted.length > 0 ? sorted[0].timestamp : 0;
  const periodEnd = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : 0;

  const reduction = computeReduction(readings);
  const claimedAmount = Math.floor(reduction * config.scalingFactor);

  const sensorReadings: number[] = new Array(config.maxReadings).fill(0);
  const readingTimestamps: number[] = new Array(config.maxReadings).fill(0);

  for (let i = 0; i < sorted.length; i++) {
    sensorReadings[i] = sorted[i].value;
    readingTimestamps[i] = sorted[i].timestamp;
  }

  return {
    project_id_hash: projectIdHash,
    period_start: periodStart,
    period_end: periodEnd,
    claimed_amount: claimedAmount,
    methodology_version: 1,
    sensor_readings: sensorReadings,
    reading_timestamps: readingTimestamps,
    num_readings: sorted.length,
    reduction_amount: claimedAmount,
  };
}
