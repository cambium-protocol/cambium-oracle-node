import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '@cambium-protocol/sdk';
import { KeypairSigner } from '../signer/keypair';

interface SubmitConfig {
  network: string;
  sorobanRpcUrl: string;
  registryContractId: string;
  signerSecret: string;
}

interface SubmitArgs {
  projectId: string;
  vintageYear: number;
  amount: string;
  proofData: string;
  publicInputs: string[];
}

export async function submitMintRequest(
  args: SubmitArgs,
  config: SubmitConfig,
): Promise<{ status: string; hash?: string }> {
  const keypair = StellarSdk.Keypair.fromSecret(config.signerSecret);
  const signer = new KeypairSigner(keypair);

  const client = new CambiumClient({
    network: config.network as 'testnet' | 'mainnet',
    rpcUrl: config.sorobanRpcUrl,
    contracts: {
      registry: config.registryContractId,
      creditToken: '',
      marketplace: '',
      retirement: '',
    },
    signer,
  });

  const tx = await client.registry.requestMint(
    args.projectId,
    args.vintageYear,
    args.amount,
    {
      proofData: args.proofData,
      publicInputs: args.publicInputs,
    },
    keypair.publicKey(),
  );

  const signedXdr = await signer.signTransaction(tx.toXDR());
  const result = await client.submit(signedXdr);

  return {
    status: result.status,
    hash: result.hash,
  };
}
