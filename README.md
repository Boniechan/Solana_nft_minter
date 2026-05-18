# Solana NFT Minter

This project gives you a full-stack Solana NFT minting starter:

- `programs/solana_nft_minter`: an Anchor/Rust program that stores collection state and a mint receipt for each NFT.
- `app`: a React + Vite frontend that lets the user choose a wallet, uploads metadata to IPFS through Pinata, mints an NFT on Solana Testnet, and records the mint in the Rust program.

## Stack

- React 18 + Vite
- Solana wallet adapter
- SPL Token + Metaplex Token Metadata
- Anchor 0.32.1
- Solana Testnet

## Project Layout

```text
.
├── app/
├── programs/
│   └── solana_nft_minter/
├── migrations/
├── tests/
├── Anchor.toml
└── target-program-keypair.json
```

## Setup

1. Install dependencies:

```bash
npm install
npm --prefix app install
```

2. Copy the frontend env template and add your Pinata JWT:

```bash
cp app/.env.example app/.env
```

Then open `app/.env` and set:

```env
VITE_PINATA_JWT=your_real_pinata_jwt
VITE_PINATA_GATEWAY=gateway.pinata.cloud
```

Pinata's quickstart says to open `API Keys` in the Pinata app, create a new key, and copy the generated `JWT`.
Source: https://docs.pinata.cloud/quickstart

3. Make sure your Solana CLI points at testnet and your wallet has testnet SOL:

```bash
solana config set --url testnet
solana airdrop 2
```

4. Build and deploy the Anchor program:

```bash
anchor build
anchor deploy
```

5. Start the frontend:

```bash
npm run frontend:dev
```

## How Minting Works

1. The frontend uploads the image and metadata JSON to Pinata.
2. It creates a new SPL mint with `0` decimals and mints exactly `1` token.
3. It creates Metaplex metadata and master edition accounts for the NFT.
4. It calls the Anchor program to initialize the collection PDA if needed and write a mint receipt PDA for the new NFT.

## Notes

- The app is configured for Solana Testnet by default.
- The Rust program acts as the project-owned on-chain layer while the wallet signs the mint transaction.
- Putting a Pinata JWT directly into a browser app exposes that token to users. For production, prefer a server-issued upload flow or a tightly scoped key with limited permissions/uses.
- Node 20+ is recommended long term because some Solana wallet packages now declare newer engine requirements, though the current setup built successfully on this machine.
- If you want a production-ready flow later, the next step would be adding guarded uploads, collection verification, and server-side storage options.
