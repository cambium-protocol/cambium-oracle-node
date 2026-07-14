import * as path from 'path';
import { ManualAuditConnector } from '../../src/connectors/manual-audit';

const SAMPLE_PATH = path.resolve(__dirname, '../../data/manual-audit-sample.json');

describe('ManualAuditConnector', () => {
  test('loads sample data and returns MRVReading array', async () => {
    const connector = new ManualAuditConnector({ filePath: SAMPLE_PATH });
    const readings = await connector.fetch('any-project');

    expect(Array.isArray(readings)).toBe(true);
    expect(readings.length).toBe(5);
    expect(readings[0]).toHaveProperty('timestamp');
    expect(readings[0]).toHaveProperty('value');
    expect(readings[0]).toHaveProperty('unit');
    expect(readings[0]).toHaveProperty('source');
    expect(readings[0].source).toBe('manual-audit');
  });

  test('validates required fields', async () => {
    const connector = new ManualAuditConnector({ filePath: SAMPLE_PATH });
    const readings = await connector.fetch('');

    for (const r of readings) {
      expect(typeof r.timestamp).toBe('number');
      expect(typeof r.value).toBe('number');
      expect(typeof r.unit).toBe('string');
      expect(r.source).toBe('manual-audit');
    }
  });

  test('throws on missing file', async () => {
    const connector = new ManualAuditConnector({
      filePath: '/nonexistent/file.json',
    });
    await expect(connector.fetch('')).rejects.toThrow();
  });

  test('throws on invalid JSON missing required fields', async () => {
    const tmpFile = path.join(__dirname, '../../data/invalid-test.json');
    const fs = require('fs');
    fs.writeFileSync(tmpFile, JSON.stringify({ foo: 'bar' }));
    const connector = new ManualAuditConnector({ filePath: tmpFile });
    await expect(connector.fetch('')).rejects.toThrow('missing projectId');
    fs.unlinkSync(tmpFile);
  });
});
