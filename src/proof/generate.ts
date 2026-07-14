import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { CircuitInput } from '../methodologies/vm0007/engine';

export interface ProofResult {
  proofData: string;
  publicInputs: string[];
}

export function generateProof(
  input: CircuitInput,
  zkCircuitsPath: string,
): ProofResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cambium-proof-'));
  const inputFile = path.join(tmpDir, 'input.json');
  const outputDir = path.join(tmpDir, 'proof');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));

  const proveScript = path.join(zkCircuitsPath, 'scripts', 'prove.js');
  const cmd = `node "${proveScript}" --circuit reduction_threshold --input "${inputFile}" --output "${outputDir}"`;

  try {
    execSync(cmd, {
      cwd: zkCircuitsPath,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Proof generation failed: ${stderr}`);
  }

  const proofPath = path.join(outputDir, 'proof.json');
  const publicPath = path.join(outputDir, 'public.json');

  if (!fs.existsSync(proofPath)) {
    throw new Error(`Proof file not found: ${proofPath}`);
  }
  if (!fs.existsSync(publicPath)) {
    throw new Error(`Public signals file not found: ${publicPath}`);
  }

  const proofJson = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  const publicSignals: string[] = JSON.parse(
    fs.readFileSync(publicPath, 'utf-8'),
  );

  const proofHex = encodeProofToHex(proofJson);

  const paddedInputs = publicSignals.map((sig) => {
    const hex = BigInt(sig).toString(16).padStart(64, '0');
    return hex;
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  return {
    proofData: proofHex,
    publicInputs: paddedInputs,
  };
}

function encodeProofToHex(proof: any): string {
  const parts: string[] = [];
  for (const key of ['pi_a', 'pi_b', 'pi_c']) {
    const arr = proof[key];
    if (Array.isArray(arr)) {
      for (const val of arr) {
        const hex = BigInt(val).toString(16).padStart(64, '0');
        parts.push(hex);
      }
    }
  }
  return parts.join('');
}
