import * as StellarSdk from '@stellar/stellar-sdk';

export class KeypairSigner {
  private keypair: StellarSdk.Keypair;

  constructor(keypair: StellarSdk.Keypair) {
    this.keypair = keypair;
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async signTransaction(xdr: string): Promise<string> {
    const networkPassphrase =
      'Test SDF Network ; September 2015';
    const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
    tx.sign(this.keypair);
    return tx.toXDR();
  }
}
