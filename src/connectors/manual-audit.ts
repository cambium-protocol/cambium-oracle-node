import * as fs from 'fs';
import * as path from 'path';
import { DataSource, MRVReading } from './types';

interface ManualAuditConfig {
  filePath: string;
}

interface AuditReading {
  timestamp: number;
  value: number;
  unit: string;
}

interface AuditDocument {
  projectId: string;
  auditor: string;
  auditDate: string;
  auditorSignature: string;
  readings: AuditReading[];
}

export class ManualAuditConnector implements DataSource {
  public readonly name = 'manual-audit';
  private filePath: string;

  constructor(config: ManualAuditConfig) {
    this.filePath = path.resolve(config.filePath);
  }

  async fetch(_projectId: string): Promise<MRVReading[]> {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const doc: AuditDocument = JSON.parse(raw);

    if (!doc.projectId) {
      throw new Error('Manual audit document missing projectId');
    }
    if (!doc.auditor) {
      throw new Error('Manual audit document missing auditor');
    }
    if (!Array.isArray(doc.readings) || doc.readings.length === 0) {
      throw new Error('Manual audit document missing or empty readings array');
    }

    return doc.readings.map((r) => ({
      timestamp: r.timestamp,
      value: r.value,
      unit: r.unit,
      source: this.name,
    }));
  }
}
