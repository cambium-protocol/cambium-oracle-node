import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { ManualAuditConnector } from './connectors/manual-audit';
import { buildCircuitInput, CircuitInput } from './methodologies/vm0007/engine';
import { generateProof } from './proof/generate';
import { submitMintRequest } from './proof/submit';

const logger = pino({ level: 'info' });

interface OracleConfig {
  network: string;
  sorobanRpcUrl: string;
  registryContractId: string;
  creditTokenContractId: string;
  zkVerifierContractId: string;
  zkCircuitsPath: string;
  signerSecretKeyEnv: string;
  methodologies: Record<string, any>;
  connectors: Record<string, any>;
  api: { port: number };
}

function loadConfig(): OracleConfig {
  const configDir = path.resolve(__dirname, '..', 'config');
  const localPath = path.join(configDir, 'local.json');
  const defaultPath = path.join(configDir, 'default.json');
  const configPath = fs.existsSync(localPath) ? localPath : defaultPath;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function createHttpServer(port: number) {
  const http = require('http');
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    logger.info(`Health API listening on :${port}`);
  });
  return server;
}

export async function runPipeline(config: OracleConfig): Promise<void> {
  logger.info('Starting oracle pipeline');

  const connectorConfig = config.connectors['manual-audit'];
  if (!connectorConfig) {
    throw new Error('manual-audit connector not configured');
  }

  const connector = new ManualAuditConnector({
    filePath: path.resolve(__dirname, '..', connectorConfig.filePath),
  });

  logger.info('Fetching data from manual-audit connector');
  const readings = await connector.fetch('');
  logger.info({ count: readings.length }, 'Readings fetched');

  const projectIdHash =
    '0x0000000000000000000000000000000000000000000000000000000000000001';

  const vm0007Config = config.methodologies['vm0007'] || {
    maxReadings: 32,
    scalingFactor: 1_000_000,
  };

  logger.info('Building circuit input via vm0007 engine');
  const circuitInput: CircuitInput = buildCircuitInput(
    projectIdHash,
    readings,
    {
      maxReadings: vm0007Config.maxReadings || 32,
      scalingFactor: vm0007Config.scalingFactor || 1_000_000,
    },
  );

  logger.info('Generating Groth16 proof via zk-circuits');
  const proof = generateProof(circuitInput, config.zkCircuitsPath);
  logger.info(
    { proofDataLen: proof.proofData.length, publicInputsLen: proof.publicInputs.length },
    'Proof generated',
  );

  const signerSecret = process.env[config.signerSecretKeyEnv];
  if (!signerSecret) {
    throw new Error(
      `Signer secret not found in env: ${config.signerSecretKeyEnv}`,
    );
  }

  if (!config.registryContractId) {
    logger.warn('registryContractId not configured — skipping submission');
    logger.info('Pipeline complete (proof generated but not submitted)');
    return;
  }

  logger.info('Submitting mint request to registry contract');
  const result = await submitMintRequest(
    {
      projectId: projectIdHash,
      vintageYear: 2025,
      amount: String(circuitInput.claimed_amount),
      proofData: proof.proofData,
      publicInputs: proof.publicInputs,
    },
    {
      network: config.network,
      sorobanRpcUrl: config.sorobanRpcUrl,
      registryContractId: config.registryContractId,
      signerSecret,
    },
  );

  logger.info({ status: result.status, hash: result.hash }, 'Submission complete');
}

async function main() {
  const config = loadConfig();
  const once = process.argv.includes('--once');

  createHttpServer(config.api?.port || 4000);

  if (once) {
    try {
      await runPipeline(config);
    } catch (err) {
      logger.error(err, 'Pipeline failed');
      process.exit(1);
    }
    process.exit(0);
  }

  logger.info('Oracle node started (scheduled mode, interval 60s)');
  setInterval(async () => {
    try {
      await runPipeline(config);
    } catch (err) {
      logger.error(err, 'Pipeline run failed');
    }
  }, 60_000);
}

main();
