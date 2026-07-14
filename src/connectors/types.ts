export interface MRVReading {
  timestamp: number;
  value: number;
  unit: string;
  source: string;
}

export interface DataSource {
  name: string;
  fetch(projectId: string): Promise<MRVReading[]>;
}
