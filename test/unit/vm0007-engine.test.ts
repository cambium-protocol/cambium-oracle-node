import { computeReduction, buildCircuitInput } from '../../src/methodologies/vm0007/engine';
import { MRVReading } from '../../src/connectors/types';

function makeReadings(values: number[]): MRVReading[] {
  return values.map((v, i) => ({
    timestamp: 1704067200 + i * 86400,
    value: v,
    unit: 'tCO2e',
    source: 'manual-audit',
  }));
}

describe('VM0007 Engine', () => {
  test('computeReduction sums values', () => {
    const readings = makeReadings([100, 200, 300]);
    expect(computeReduction(readings)).toBe(600);
  });

  test('computeReduction returns 0 for empty', () => {
    expect(computeReduction([])).toBe(0);
  });

  test('computeReduction throws on negative value', () => {
    const readings = makeReadings([-10]);
    expect(() => computeReduction(readings)).toThrow('Negative reading');
  });

  test('buildCircuitInput formats 32-element arrays', () => {
    const readings = makeReadings([100, 200, 300]);
    const input = buildCircuitInput('0x01', readings);

    expect(input.sensor_readings.length).toBe(32);
    expect(input.reading_timestamps.length).toBe(32);
    expect(input.num_readings).toBe(3);
    expect(input.sensor_readings[0]).toBe(100);
    expect(input.sensor_readings[1]).toBe(200);
    expect(input.sensor_readings[2]).toBe(300);
    expect(input.sensor_readings[3]).toBe(0);
    expect(input.reduction_amount).toBe(600 * 1_000_000);
    expect(input.claimed_amount).toBe(600 * 1_000_000);
  });

  test('buildCircuitInput rejects too many readings', () => {
    const readings = makeReadings(new Array(33).fill(100));
    expect(() => buildCircuitInput('0x01', readings)).toThrow('Too many readings');
  });

  test('buildCircuitInput handles empty readings', () => {
    const input = buildCircuitInput('0x01', []);
    expect(input.num_readings).toBe(0);
    expect(input.reduction_amount).toBe(0);
    expect(input.sensor_readings.length).toBe(32);
  });
});
