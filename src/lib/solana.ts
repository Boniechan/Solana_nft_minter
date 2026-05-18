import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  PROGRAM_ID,
  COLLECTION_SEED,
  MINT_RECEIPT_SEED,
  DEFAULT_COLLECTION_SYMBOL,
} from "./constants";
import {
  getCreateMasterEditionV3InstructionDataSerializer,
  getCreateMetadataAccountV3InstructionDataSerializer,
} from "@metaplex-foundation/mpl-token-metadata";

export type MintPayload = {
  connection: Connection;
  walletPublicKey: PublicKey;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Keypair[] },
  ) => Promise<string>;
  name: string;
  description: string;
  imageFile: File;
  pinataJwt: string;
  collectionName: string;
  collectionSymbol?: string;
};

export type MintResult = {
  signature: string;
  mintAddress: string;
  metadataUri: string;
};

export type CollectionState = {
  authority: string;
  mintCount: number;
  name: string;
  symbol: string;
};

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const PROGRAM_PUBLIC_KEY = new PublicKey(PROGRAM_ID);

const INITIALIZE_COLLECTION_DISCRIMINATOR = Buffer.from([
  112, 62, 53, 139, 173, 152, 98, 93,
]);
const REGISTER_MINT_DISCRIMINATOR = Buffer.from([
  242, 43, 74, 162, 217, 214, 191, 171,
]);

function serializeAnchorString(value: string): Buffer {
  const valueBuffer = Buffer.from(value, "utf8");
  const sizeBuffer = Buffer.alloc(4);
  sizeBuffer.writeUInt32LE(valueBuffer.length, 0);
  return Buffer.concat([sizeBuffer, valueBuffer]);
}

function readAnchorString(buffer: Buffer, offset: number) {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;

  return {
    nextOffset: end,
    value: buffer.toString("utf8", start, end),
  };
}

function getMetadataPdas(mint: PublicKey) {
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const [masterEditionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  return { metadataPda, masterEditionPda };
}

function createMetadataAccountInstruction(
  metadata: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
  payer: PublicKey,
  uri: string,
  name: string,
  symbol: string,
) {
  const data = Buffer.from(
    getCreateMetadataAccountV3InstructionDataSerializer().serialize({
      data: {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    }),
  );

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function createMasterEditionInstruction(
  edition: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
  payer: PublicKey,
  metadata: PublicKey,
) {
  const data = Buffer.from(
    getCreateMasterEditionV3InstructionDataSerializer().serialize({
      maxSupply: 0n,
    }),
  );

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: edition, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function getCollectionStatePda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(COLLECTION_SEED)],
    PROGRAM_PUBLIC_KEY,
  );
}

export function getMintReceiptPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_RECEIPT_SEED), mint.toBuffer()],
    PROGRAM_PUBLIC_KEY,
  );
}

export async function fetchCollectionState(connection: Connection) {
  const [collectionStatePda] = getCollectionStatePda();
  const accountInfo = await connection.getAccountInfo(collectionStatePda);

  if (!accountInfo) {
    return null;
  }

  const buffer = Buffer.from(accountInfo.data);
  const authority = new PublicKey(buffer.subarray(8, 40)).toBase58();
  const mintCount = Number(buffer.readBigUInt64LE(40));
  const name = readAnchorString(buffer, 49);
  const symbol = readAnchorString(buffer, name.nextOffset);

  return {
    authority,
    mintCount,
    name: name.value,
    symbol: symbol.value,
  } satisfies CollectionState;
}

async function uploadMetadata(
  jwt: string,
  name: string,
  description: string,
  imageFile: File,
  collectionName: string,
) {
  if (!jwt || jwt === "your_pinata_jwt_here") {
    throw new Error(
      "VITE_PINATA_JWT is missing. Add a real Pinata JWT in app/.env.",
    );
  }

  try {
    const imageData = new FormData();
    imageData.append("file", imageFile);
    imageData.append(
      "pinataMetadata",
      JSON.stringify({
        name: imageFile.name || `${name}.png`,
      }),
    );
    imageData.append(
      "pinataOptions",
      JSON.stringify({
        cidVersion: 1,
      }),
    );

    const imageUpload = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: imageData,
      },
    );

    if (!imageUpload.ok) {
      const errorText = await imageUpload.text();
      throw new Error(
        `Pinata file upload failed (${imageUpload.status}): ${errorText}`,
      );
    }

    const imageUploadResult = (await imageUpload.json()) as {
      IpfsHash: string;
    };
    const imageUri = `ipfs://${imageUploadResult.IpfsHash}`;

    const metadataUpload = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          pinataOptions: {
            cidVersion: 1,
          },
          pinataMetadata: {
            name: `${name}.json`,
          },
          pinataContent: {
            name,
            description,
            image: imageUri,
            external_url: "https://pinata.cloud",
            properties: {
              collection: collectionName,
              network: "solana-testnet",
              createdWith: "Solana NFT Minter",
            },
          },
        }),
      },
    );

    if (!metadataUpload.ok) {
      const errorText = await metadataUpload.text();
      throw new Error(
        `Pinata metadata upload failed (${metadataUpload.status}): ${errorText}`,
      );
    }

    const metadataUploadResult = (await metadataUpload.json()) as {
      IpfsHash: string;
    };

    return `ipfs://${metadataUploadResult.IpfsHash}`;
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("jwt") ||
        message.includes("unauthorized")
      ) {
        throw new Error(
          "Your Pinata JWT is invalid. Replace VITE_PINATA_JWT in app/.env with a real JWT from your Pinata API Keys page.",
        );
      }
    }

    throw error;
  }
}

function createInitializeCollectionInstruction(
  initializer: PublicKey,
  collectionState: PublicKey,
  collectionName: string,
  collectionSymbol: string,
) {
  return new TransactionInstruction({
    programId: PROGRAM_PUBLIC_KEY,
    keys: [
      { pubkey: initializer, isSigner: true, isWritable: true },
      { pubkey: collectionState, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INITIALIZE_COLLECTION_DISCRIMINATOR,
      serializeAnchorString(collectionName),
      serializeAnchorString(collectionSymbol),
    ]),
  });
}

function createRegisterMintInstruction(
  owner: PublicKey,
  collectionState: PublicKey,
  mintReceipt: PublicKey,
  mint: PublicKey,
  name: string,
  uri: string,
) {
  return new TransactionInstruction({
    programId: PROGRAM_PUBLIC_KEY,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: collectionState, isSigner: false, isWritable: true },
      { pubkey: mintReceipt, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      REGISTER_MINT_DISCRIMINATOR,
      serializeAnchorString(name),
      serializeAnchorString(uri),
    ]),
  });
}

export async function mintNft(payload: MintPayload): Promise<MintResult> {
  const {
    connection,
    walletPublicKey,
    sendTransaction,
    name,
    description,
    imageFile,
    pinataJwt,
    collectionName,
    collectionSymbol = DEFAULT_COLLECTION_SYMBOL,
  } = payload;

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  if (!trimmedName) {
    throw new Error("NFT name is required.");
  }

  if (!trimmedDescription) {
    throw new Error("NFT description is required.");
  }

  if (!pinataJwt) {
    throw new Error("Add VITE_PINATA_JWT to upload your NFT metadata.");
  }

  const metadataUri = await uploadMetadata(
    pinataJwt,
    trimmedName,
    trimmedDescription,
    imageFile,
    collectionName,
  );

  const mintKeypair = Keypair.generate();
  const tokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    walletPublicKey,
  );
  const [collectionStatePda] = getCollectionStatePda();
  const [mintReceiptPda] = getMintReceiptPda(mintKeypair.publicKey);
  const { metadataPda, masterEditionPda } = getMetadataPdas(
    mintKeypair.publicKey,
  );
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);
  const collectionAccount = await connection.getAccountInfo(collectionStatePda);

  const transaction = new Transaction();

  if (!collectionAccount) {
    transaction.add(
      createInitializeCollectionInstruction(
        walletPublicKey,
        collectionStatePda,
        collectionName,
        collectionSymbol,
      ),
    );
  }

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: walletPublicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      0,
      walletPublicKey,
      walletPublicKey,
    ),
    createAssociatedTokenAccountInstruction(
      walletPublicKey,
      tokenAccount,
      walletPublicKey,
      mintKeypair.publicKey,
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      tokenAccount,
      walletPublicKey,
      1,
    ),
    createMetadataAccountInstruction(
      metadataPda,
      mintKeypair.publicKey,
      walletPublicKey,
      walletPublicKey,
      metadataUri,
      trimmedName,
      collectionSymbol,
    ),
    createMasterEditionInstruction(
      masterEditionPda,
      mintKeypair.publicKey,
      walletPublicKey,
      walletPublicKey,
      metadataPda,
    ),
    createRegisterMintInstruction(
      walletPublicKey,
      collectionStatePda,
      mintReceiptPda,
      mintKeypair.publicKey,
      trimmedName,
      metadataUri,
    ),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = walletPublicKey;
  transaction.recentBlockhash = blockhash;

  const signature = await sendTransaction(transaction, connection, {
    signers: [mintKeypair],
  });

  await connection.confirmTransaction(
    {
      blockhash,
      lastValidBlockHeight,
      signature,
    },
    "confirmed",
  );

  return {
    signature,
    mintAddress: mintKeypair.publicKey.toBase58(),
    metadataUri,
  };
}
