import { BrowserProvider, Contract, type Eip1193Provider, type Signer } from "ethers";

import WarrantyRegistryAbi from "@/abi/WarrantyRegistry.json";

const CHAIN_ID_DECIMAL = Number(import.meta.env.VITE_CHAIN_ID ?? 84532);
const CHAIN_ID_HEX = `0x${CHAIN_ID_DECIMAL.toString(16)}`;
const CHAIN_RPC_URL = import.meta.env.VITE_CHAIN_RPC_URL ?? "https://sepolia.base.org";
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export class MetaMaskNotFoundError extends Error {
  constructor() {
    super("No browser wallet found. Install MetaMask from metamask.io and try again.");
  }
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getInjectedEthereum(): EthereumProvider {
  const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum) throw new MetaMaskNotFoundError();
  return ethereum;
}

export async function connectWallet(): Promise<string> {
  const ethereum = getInjectedEthereum();
  const provider = new BrowserProvider(ethereum as Eip1193Provider);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  await ensureBaseSepoliaNetwork(ethereum);
  return accounts[0];
}

export async function disconnectWallet(): Promise<void> {
  // Injected wallets (MetaMask, etc.) don't expose a programmatic disconnect;
  // the user disconnects from within the extension itself.
}

export async function ensureBaseSepoliaNetwork(ethereum?: EthereumProvider): Promise<void> {
  const target = ethereum ?? getInjectedEthereum();
  try {
    await target.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (error) {
    const switchError = error as { code?: number };
    if (switchError.code === 4902) {
      await target.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [CHAIN_RPC_URL],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

export async function getSigner(): Promise<Signer> {
  const ethereum = getInjectedEthereum();
  const provider = new BrowserProvider(ethereum as Eip1193Provider);
  return provider.getSigner();
}

export async function signMessage(message: string): Promise<string> {
  const signer = await getSigner();
  return signer.signMessage(message);
}

export async function sendTransferTransaction(warrantyId: number, toWallet: string): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS is not configured");
  const signer = await getSigner();
  const contract = new Contract(CONTRACT_ADDRESS, WarrantyRegistryAbi, signer);
  const tx = await contract.transferWarranty(warrantyId, toWallet);
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export function computeExpiryDate(purchaseDateIso: string, durationMonths: number): string {
  const parts = purchaseDateIso.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const monthIndex = month - 1 + durationMonths;
  const newYear = year + Math.floor(monthIndex / 12);
  const newMonth = (monthIndex % 12) + 1;
  const newDay = newMonth === 2 ? Math.min(day, 28) : day;

  const yStr = newYear.toString();
  const mStr = newMonth.toString().padStart(2, "0");
  const dStr = newDay.toString().padStart(2, "0");
  return `${yStr}-${mStr}-${dStr}`;
}

export async function sendRegisterTransaction(
  initialOwner: string,
  productId: string,
  serialNumber: string,
  purchaseDate: string,
  warrantyDurationMonths: number,
  invoiceCid: string
): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS is not configured");
  const signer = await getSigner();
  const contract = new Contract(CONTRACT_ADDRESS, WarrantyRegistryAbi, signer);

  const expiryDateIso = computeExpiryDate(purchaseDate, warrantyDurationMonths);
  const purchaseTimestamp = Math.floor(new Date(purchaseDate).getTime() / 1000);
  const expiryTimestamp = Math.floor(new Date(expiryDateIso).getTime() / 1000);

  const tx = await contract.registerWarranty(
    initialOwner,
    productId,
    serialNumber,
    purchaseTimestamp,
    expiryTimestamp,
    invoiceCid
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function onAccountsChanged(callback: (accounts: string[]) => void): Promise<() => void> {
  const ethereum = getInjectedEthereum();
  ethereum.on?.("accountsChanged", callback as (...args: unknown[]) => void);
  return () => ethereum.removeListener?.("accountsChanged", callback as (...args: unknown[]) => void);
}
