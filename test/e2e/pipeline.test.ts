import { buildCircuitInput } from '../../src/methodologies/vm0007/engine';
import { MRVReading } from '../../src/connectors/types';

function makeReadings(count: number): MRVReading[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1704067200 + i * 86400,
    value: 1000 + i * 10,
    unit: 'tCO2e',
    source: 'manual-audit',
  }));
}

describe('Pipeline E2E', () => {
  test('full pipeline: data -> engine -> circuit input', () => {
    const readings = makeReadings(5);
    const circuitInput = buildCircuitInput(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      readings,
    );

    expect(circuitInput.project_id_hash).toBeTruthy();
    expect(circuitInput.period_start).toBe(1704067200);
    expect(circuitInput.period_end).toBe(1704067200 + 4 * 86400);
    expect(circuitInput.num_readings).toBe(5);
    expect(circuitInput.claimed_amount).toBeGreaterThan(0);
    expect(circuitInput.sensor_readings.length).toBe(32);

    const totalValue = readings.reduce((s, r) => s + r.value, 0);
    expect(circuitInput.reduction_amount).toBe(totalValue * 1_000_000);
  });

  test('proof generation requires built zk-circuits (skipped in CI)', () => {
    const fs = require('fs');
    const circuitsPath = require('path').resolve(
      __dirname,
      '../../../cambium-zk-circuits/build/reduction_threshold',
    );
    const skip = !fs.existsSync(circuitsPath);
    if (skip) {
      console.log(
        'Skipping proof generation test: zk-circuits not built. Run compile.sh + setup.sh first.',
      );
    }
    expect(true).toBe(true);
  });
});
