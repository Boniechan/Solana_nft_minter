import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COLLECTION_NAME,
  DEFAULT_COLLECTION_SYMBOL,
  NFT_STORAGE_TOKEN,
  SOLANA_EXPLORER_CLUSTER,
} from "./lib/constants";

type MintOutcome = {
  signature: string;
  mintAddress: string;
  metadataUri: string;
  name: string;
};

type CollectionState = {
  authority: string;
  mintCount: number;
  name: string;
  symbol: string;
};

type BrowserWalletProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58(): string };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: { toBase58(): string };
  }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(transaction: T) => Promise<T>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: BrowserWalletProvider };
    backpack?: { solana?: BrowserWalletProvider };
    solflare?: BrowserWalletProvider;
    solana?: BrowserWalletProvider;
  }
}

type WalletId = "phantom" | "solflare" | "backpack";

type WalletOption = {
  id: WalletId;
  label: string;
  installUrl: string;
  getProvider: (windowObject: Window) => BrowserWalletProvider | null;
};

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: "phantom",
    label: "Phantom",
    installUrl: "https://phantom.app/",
    getProvider: (windowObject) => windowObject.phantom?.solana ?? null,
  },
  {
    id: "solflare",
    label: "Solflare",
    installUrl: "https://solflare.com/download",
    getProvider: (windowObject) => windowObject.solflare ?? null,
  },
  {
    id: "backpack",
    label: "Backpack",
    installUrl: "https://backpack.app/",
    getProvider: (windowObject) =>
      windowObject.backpack?.solana ??
      (windowObject.solana?.isBackpack ? windowObject.solana : null),
  },
];

function getWalletProvider(walletId: WalletId) {
  if (typeof window === "undefined") {
    return null;
  }

  const wallet = WALLET_OPTIONS.find((option) => option.id === walletId);
  return wallet ? wallet.getProvider(window) : null;
}

function getInitialWalletId(): WalletId {
  return "phantom";
}

function App() {
  const endpoint =
    import.meta.env.VITE_SOLANA_RPC_URL ?? "https://api.testnet.solana.com";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [isMinting, setIsMinting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState("Choose a wallet and connect to begin minting on Solana Testnet.");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<MintOutcome | null>(null);
  const [collection, setCollection] = useState<CollectionState | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<WalletId>(getInitialWalletId);
  const [walletInstalled, setWalletInstalled] = useState(false);
  const selectedWallet = WALLET_OPTIONS.find(
    (option) => option.id === selectedWalletId,
  )!;

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : "Wallet disconnected";

  const explorerBase = `https://explorer.solana.com`;

  useEffect(() => {
    const provider = getWalletProvider(selectedWalletId);
    setWalletInstalled(Boolean(provider));
    setWalletAddress(null);
    setError("");

    if (!provider) {
      setStatus(`Install ${selectedWallet.label} or choose another wallet.`);
      return;
    }

    const syncWalletAddress = () => {
      setWalletAddress(provider.publicKey?.toBase58() ?? null);
    };

    const handleConnect = () => {
      syncWalletAddress();
      setStatus(
        `${selectedWallet.label} connected. You can mint when your artwork is ready.`,
      );
    };

    const handleDisconnect = () => {
      setWalletAddress(null);
      setStatus("Wallet disconnected.");
    };

    const handleAccountChanged = () => {
      syncWalletAddress();
    };

    provider.on?.("connect", handleConnect);
    provider.on?.("disconnect", handleDisconnect);
    provider.on?.("accountChanged", handleAccountChanged);

    return () => {
      provider.removeListener?.("connect", handleConnect);
      provider.removeListener?.("disconnect", handleDisconnect);
      provider.removeListener?.("accountChanged", handleAccountChanged);
    };
  }, [selectedWalletId, selectedWallet.label]);

  useEffect(() => {
    void (async () => {
      try {
        const [{ Connection }, { fetchCollectionState }] = await Promise.all([
          import("@solana/web3.js"),
          import("./lib/solana"),
        ]);
        const connection = new Connection(endpoint, "confirmed");
        const state = await fetchCollectionState(connection);
        setCollection(state);
      } catch (collectionError) {
        console.error(collectionError);
      }
    })();
  }, [endpoint, outcome?.signature]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const canMint = useMemo(() => {
    return Boolean(
      walletAddress &&
        imageFile &&
        name.trim() &&
        description.trim() &&
        NFT_STORAGE_TOKEN,
    );
  }, [
    walletAddress,
    imageFile,
    name,
    description,
  ]);

  const handleConnectWallet = async () => {
    const provider = getWalletProvider(selectedWalletId);

    if (!provider) {
      setError(`${selectedWallet.label} is not installed in this browser yet.`);
      setStatus("Wallet extension required.");
      window.open(selectedWallet.installUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setError("");
    setIsConnecting(true);

    try {
      const response = await provider.connect();
      const address =
        response.publicKey?.toBase58() ?? provider.publicKey?.toBase58() ?? null;
      setWalletAddress(address);
      setStatus(
        `${selectedWallet.label} connected. You can mint when your artwork is ready.`,
      );
    } catch (connectError) {
      console.error(connectError);
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Wallet connection failed.",
      );
      setStatus("Wallet connection failed.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    const provider = getWalletProvider(selectedWalletId);

    if (!provider) {
      setWalletAddress(null);
      return;
    }

    try {
      await provider.disconnect();
    } catch (disconnectError) {
      console.error(disconnectError);
    } finally {
      setWalletAddress(null);
      setStatus("Wallet disconnected.");
    }
  };

  const handleWalletSelection = (walletId: WalletId) => {
    setSelectedWalletId(walletId);
    setWalletAddress(null);
    setStatus(`Selected ${walletId.charAt(0).toUpperCase()}${walletId.slice(1)}. Connect to continue.`);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setImageFile(nextFile);

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setImagePreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
  };

  const handleMint = async () => {
    const provider = getWalletProvider(selectedWalletId);

    if (!provider?.publicKey || !provider.signTransaction || !imageFile) {
      return;
    }

    setIsMinting(true);
    setError("");
    setOutcome(null);
    setStatus("Uploading metadata to IPFS...");

    try {
      const [{ Connection, PublicKey }, { mintNft }] = await Promise.all([
        import("@solana/web3.js"),
        import("./lib/solana"),
      ]);
      const connection = new Connection(endpoint, "confirmed");
      const walletPublicKey = new PublicKey(provider.publicKey.toBase58());
      const result = await mintNft({
        connection,
        walletPublicKey,
        sendTransaction: async (transaction, activeConnection, options) => {
          options?.signers?.forEach((signer) => {
            transaction.partialSign(signer);
          });

          const signedTransaction = await provider.signTransaction(transaction);
          return activeConnection.sendRawTransaction(
            signedTransaction.serialize(),
          );
        },
        name,
        description,
        imageFile,
        nftStorageToken: NFT_STORAGE_TOKEN,
        collectionName: collection?.name ?? DEFAULT_COLLECTION_NAME,
        collectionSymbol: collection?.symbol ?? DEFAULT_COLLECTION_SYMBOL,
      });

      const mintedName = trimmedName(name);
      setStatus("NFT minted successfully on Solana Testnet.");
      setOutcome({ ...result, name: mintedName });
      setName("");
      setDescription("");
      setImageFile(null);
      setImagePreviewUrl("");
    } catch (mintError) {
      console.error(mintError);
      setError(
        mintError instanceof Error
          ? mintError.message
          : "Mint failed. Check your wallet approval and try again.",
      );
      setStatus("Mint failed.");
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="aurora aurora-left" />
      <div className="aurora aurora-right" />

      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">Solana Testnet</span>
          <h1>Mint NFTs.</h1>
          <p>
            Upload artwork, publish metadata to IPFS, mint a master edition NFT
          </p>
        </div>

        <div className="hero-panel">
          <div className="wallet-picker">
            {WALLET_OPTIONS.map((wallet) => {
              const installed = Boolean(getWalletProvider(wallet.id));

              return (
                <button
                  key={wallet.id}
                  className={`wallet-option ${wallet.id === selectedWalletId ? "active" : ""}`}
                  onClick={() => handleWalletSelection(wallet.id)}
                  type="button"
                >
                  <span>{wallet.label}</span>
                  <small>{installed ? "Installed" : "Not installed"}</small>
                </button>
              );
            })}
          </div>
          <button
            className="wallet-button"
            onClick={walletAddress ? handleDisconnectWallet : handleConnectWallet}
            type="button"
          >
            {walletAddress
              ? "Disconnect Wallet"
              : isConnecting
                ? "Connecting..."
                : walletInstalled
                  ? `Connect ${selectedWallet.label}`
                  : `Install ${selectedWallet.label}`}
          </button>
          <div className="wallet-chip">
            <span className="wallet-chip-label">Selected wallet</span>
            <strong>{selectedWallet.label}</strong>
            <span className="wallet-chip-label">Connected address</span>
            <strong>{shortWallet}</strong>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="mint-card">
          <div className="card-header">
            <div>
              <span className="eyebrow">Mint Form</span>
              <h2>Create your NFT</h2>
            </div>
            <span className="network-pill">Testnet</span>
          </div>

          <label className="field-group">
            <span>NFT image</span>
            <input
              className="file-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />
            <div className={`upload-zone ${imagePreviewUrl ? "has-image" : ""}`}>
              {imagePreviewUrl ? (
                <img src={imagePreviewUrl} alt="NFT preview" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">+</span>
                  <p>Drop artwork here or click to upload.</p>
                  <small>PNG, JPG, GIF, WEBP</small>
                </div>
              )}
            </div>
          </label>

          <label className="field-group">
            <span>NFT name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nebula Bloom #001"
              maxLength={48}
            />
          </label>

          <label className="field-group">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tell collectors the story behind the piece."
              rows={5}
            />
          </label>

          <button
            className="mint-button"
            disabled={!canMint || isMinting}
            onClick={handleMint}
            type="button"
          >
            {isMinting ? "Minting..." : "Mint NFT"}
          </button>

          {!NFT_STORAGE_TOKEN && (
            <p className="hint error-hint">
              Add <code>VITE_NFT_STORAGE_TOKEN</code> in <code>app/.env</code> to
              enable metadata and image uploads.
            </p>
          )}

          {!walletInstalled && (
            <p className="hint">
              {selectedWallet.label} is not available in this browser yet, so
              minting stays disabled until you install it or choose another
              wallet above.
            </p>
          )}
        </div>

        <aside className="side-panel">
          <div className="info-card">
            <span className="eyebrow">Collection</span>
            <h3>{collection?.name ?? DEFAULT_COLLECTION_NAME}</h3>
            <p>
              Symbol: {collection?.symbol ?? DEFAULT_COLLECTION_SYMBOL}
              <br />
              Minted so far: {collection?.mintCount ?? 0}
            </p>
          </div>

          <div className="info-card">
            <span className="eyebrow">Mint status</span>
            <h3>{status}</h3>
            <p>
              Your wallet signs the mint transaction, while the Rust program
              stores a receipt for each NFT on-chain.
            </p>
          </div>

          {error && (
            <div className="info-card error-card">
              <span className="eyebrow">Error</span>
              <h3>Something needs attention</h3>
              <p>{error}</p>
            </div>
          )}

          {outcome && (
            <div className="info-card success-card">
              <span className="eyebrow">Latest mint</span>
              <h3>{outcome.name}</h3>
              <a
                href={`${explorerBase}/tx/${outcome.signature}?cluster=${SOLANA_EXPLORER_CLUSTER}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
              <a
                href={`${explorerBase}/address/${outcome.mintAddress}?cluster=${SOLANA_EXPLORER_CLUSTER}`}
                target="_blank"
                rel="noreferrer"
              >
                View mint account
              </a>
              <a href={outcome.metadataUri} target="_blank" rel="noreferrer">
                View metadata URI
              </a>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function trimmedName(value: string) {
  return value.trim() || "Freshly minted NFT";
}

export default App;
