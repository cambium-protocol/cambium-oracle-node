# cambium-oracle-node

The off-chain MRV (Measurement, Reporting, Verification) ingestion and proof-generation service for Cambium Protocol. This is the bridge between real-world project data and on-chain credit issuance.

> Part of the [Cambium Protocol](https://github.com/cambium-protocol) organization.

---

## Table of contents

- [Overview](#overview)
- [Role in the system](#role-in-the-system)
- [Data sources](#data-sources)
- [Trust model](#trust-model)
- [Pipeline](#pipeline)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Configuration](#configuration)
- [Running locally](#running-locally)
- [Running as a signer node (multi-oracle mode)](#running-as-a-signer-node-multi-oracle-mode)
- [API reference](#api-reference)
- [Testing](#testing)
- [Operational considerations](#operational-considerations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`oracle-node` is a Node.js/TypeScript service that:

1. Ingests raw MRV data for a registered project (satellite imagery analysis, IoT sensor feeds, third-party audit uploads).
2. Runs that data through the appropriate methodology logic (mirroring the constraints defined in the corresponding `zk-circuits` circuit).
3. Generates a zero-knowledge proof attesting the methodology's output, without exposing the raw data.
4. Submits the proof to the `registry` contract in [`contracts`](https://github.com/cambium-protocol/contracts) to authorize minting of new credits.

This is intentionally the least "trustless" part of the stack, and we try to say that plainly rather than bury it. See [Trust model](#trust-model).

---

## Role in the system

```
Real-world data sources
   │
   ▼
┌─────────────────────┐
│   Data connectors     │  satellite / IoT / manual audit upload
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  Methodology engine    │  mirrors zk-circuits constraint logic
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│   Proof generator      │  calls into zk-circuits' snarkjs tooling
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  Submission service    │  signs & submits tx to registry contract
└─────────────────────┘
```

---

## Data sources

Supported connectors, each implementing a common `DataSource` interface (`src/connectors/`):

| Connector | Source | Notes |
|---|---|---|
| `satellite-ndvi` | Vegetation index imagery (e.g. Sentinel-2 derived) | Used for forestry/ARR methodologies |
| `iot-sensor` | Direct sensor feed (soil carbon, biochar kiln telemetry, etc.) | Requires device attestation key registered per-project |
| `manual-audit` | Signed PDF/JSON upload from a third-party auditor | Used as a fallback and as a cross-check against automated sources |

Methodologies can require **more than one connector** to agree within tolerance before a proof is generated (configurable per methodology in `src/methodologies/<name>/config.json`) — this is one of the main mitigations against a single manipulated data source.

---

## Trust model

We think it's important to be blunt about this rather than let the ZK layer imply more trustlessness than it delivers:

- **The oracle attests that data came from a claimed source and passed methodology logic correctly.** It does not, and cannot, guarantee the physical world matches that data (a tampered sensor is still a risk that predates and survives any blockchain layer).
- **Mitigations we implement:**
  - Multi-source corroboration where a methodology supports it (see table above).
  - Device attestation for IoT connectors — sensors are provisioned with a hardware-backed signing key at installation, and readings are rejected if the signature doesn't match a registered device.
  - A public **dispute window** (default 14 days, configurable) after a proof is submitted but before credits become tradeable, during which any party can flag a proof for third-party re-review. This does not undo cryptography — it's a governance/process safety net for the data-integrity problem cryptography can't solve.
  - Operating as a **federation of independent oracle signers** (see [Running as a signer node](#running-as-a-signer-node-multi-oracle-mode)) rather than a single centralized operator, with an M-of-N threshold required before a proof submission is accepted by the `registry` contract.
- **What we explicitly do not claim:** that this eliminates fraud risk. It reduces the number of ways fraud can occur undetected and creates an auditable trail if it does.

---

## Pipeline

1. **Registration** — a project developer registers a project against the `registry` contract (see `contracts`) and configures which oracle connectors will supply its ongoing MRV data.
2. **Ingestion** — connectors poll or receive pushed data on a configurable interval (`src/scheduler.ts`).
3. **Aggregation & validation** — the methodology engine (`src/methodologies/`) runs range checks, cross-source corroboration, and computes the claimed reduction figure.
4. **Proof generation** — calls out to `zk-circuits`' proving scripts (via `@cambium-protocol/zk-circuits` npm package, or a local checkout in dev) to produce a Groth16 proof.
5. **Submission** — signs and submits a Soroban transaction invoking `registry::request_mint` with the proof and public inputs.
6. **Dispute window** — credits are minted but flagged non-transferable until the dispute window elapses without a valid challenge.

---

## Repository structure

```
oracle-node/
├── src/
│   ├── connectors/
│   │   ├── satellite-ndvi.ts
│   │   ├── iot-sensor.ts
│   │   ├── manual-audit.ts
│   │   └── types.ts
│   ├── methodologies/
│   │   ├── vm0007/
│   │   │   ├── config.json
│   │   │   └── engine.ts
│   │   └── arr/
│   ├── proof/
│   │   ├── generate.ts
│   │   └── submit.ts
│   ├── signer/                     # multi-oracle federation logic
│   │   ├── threshold.ts
│   │   └── gossip.ts
│   ├── scheduler.ts
│   ├── api/                        # REST/GraphQL admin & status API
│   └── index.ts
├── config/
│   ├── default.json
│   └── methodologies.json
├── test/
├── Dockerfile
├── package.json
└── README.md
```

---

## Prerequisites

- Node.js 20+
- A Stellar account funded for transaction fees (oracle submission signer)
- Access to `zk-circuits` build artifacts (proving/verification keys) for each methodology you intend to run
- Docker (optional, for containerized deployment)

---

## Setup

```bash
git clone https://github.com/cambium-protocol/oracle-node.git
cd oracle-node
npm install
cp config/default.json config/local.json
```

Edit `config/local.json` with your Soroban RPC endpoint, `registry` contract ID (from `contracts`' `deployed-addresses.<network>.json`), and signer keypair.

---

## Configuration

Key config fields (`config/local.json`):

```json
{
  "network": "testnet",
  "sorobanRpcUrl": "https://soroban-testnet.stellar.org",
  "registryContractId": "C...",
  "signerSecretKeySource": "env:ORACLE_SIGNER_SECRET",
  "methodologies": {
    "vm0007": {
      "requiredCorroboratingSources": 2,
      "disputeWindowSeconds": 1209600
    }
  }
}
```

Secrets (signer keys, connector API credentials) are read from environment variables, never committed — see `.env.example`.

---

## Running locally

```bash
npm run build
npm start -- --config config/local.json
```

Or with Docker:

```bash
docker build -t cambium-oracle-node .
docker run --env-file .env cambium-oracle-node
```

The service exposes a status API on `:4000` by default (`GET /health`, `GET /projects/:id/status`).

---

## Running as a signer node (multi-oracle mode)

For production/mainnet, `oracle-node` is intended to run as one of several independent signer nodes, with the `registry` contract requiring M-of-N signer approval before a proof submission mints credits.

```bash
npm start -- --config config/local.json --federation-mode --peer-list config/peers.json
```

`src/signer/gossip.ts` handles peer discovery and partial-signature aggregation. See [`docs/federation-setup.md`](./docs/federation-setup.md) for a full guide to onboarding a new independent signer operator.

---

## API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness check |
| `/projects/:id/status` | GET | Latest ingestion/proof status for a project |
| `/projects/:id/dispute` | POST | Flag a pending proof for review (dispute window only) |
| `/methodologies` | GET | List supported methodologies and their config |

Full OpenAPI spec: [`docs/openapi.yaml`](./docs/openapi.yaml).

---

## Testing

```bash
npm test              # unit tests
npm run test:e2e      # end-to-end against local Soroban sandbox + local zk-circuits build
```

E2E tests exercise the full pipeline: mock sensor data → methodology engine → proof generation → contract submission → assert mint event.

---

## Operational considerations

- **Key management:** signer secret keys should be held in an HSM or secrets manager in production, never in plaintext config. `signerSecretKeySource` supports `env:`, `aws-kms:`, and `vault:` prefixes.
- **Monitoring:** the service emits structured logs (`pino`) and Prometheus metrics on `:9090/metrics` — track proof generation latency, connector failure rate, and dispute frequency as key health indicators.
- **Cost:** proof generation is CPU-intensive (see `zk-circuits` benchmarks); provision accordingly for methodologies with larger circuits.

---

## Roadmap

- [ ] Expand connector set (LIDAR-based forestry monitoring, additional sensor vendors)
- [ ] Formalize the dispute-resolution process into an on-chain arbitration contract rather than an off-chain-coordinated pause
- [ ] Public dashboard of signer federation health and historical dispute outcomes
- [ ] Support STARK proof generation path once available in `contracts`/`zk-circuits`

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). New connectors must include a written explanation of their failure modes and how they can be gamed, as part of the PR description — this is a hard requirement, not a suggestion.

## License

[Apache License 2.0](./LICENSE)
