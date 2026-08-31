import { ethers } from 'ethers';
import ABI from './abi.json';

/**
 * src/lib/web3/escrow-contract.ts
 *
 * Server-side wrapper around the Shtiya escrow smart contract.
 * All functions use the service wallet (ESCROW_PRIVATE_KEY) to sign transactions.
 *
 * Environment variables required:
 *   ESCROW_RPC_URL          — JSON-RPC endpoint (e.g. Alchemy/Infura Sepolia URL)
 *   ESCROW_CONTRACT_ADDRESS — deployed contract address (checksummed)
 *   ESCROW_PRIVATE_KEY      — private key of the service wallet (keep secret!)
 *
 * Never import this file from a 'use client' component.
 */

// ── Typed contract interface ──────────────────────────────────────────────────
// ethers.Contract carries [key: string]: any, so under noUncheckedIndexedAccess
// every dynamic method dispatch is possibly-undefined. The interface below
// narrows the three call sites to definite return types without losing
// the underlying ethers.Contract instance.
interface EscrowContract extends ethers.BaseContract {
  deposit(ledgerId: string, overrides?: { value: bigint }): Promise<ethers.TransactionResponse>;
  release(ledgerId: string, recipient: string): Promise<ethers.TransactionResponse>;
  getBalance(ledgerId: string): Promise<bigint>;
}

// ── Client factory ────────────────────────────────────────────────────────────

function getContract(): EscrowContract {
  const rpcUrl = process.env.ESCROW_RPC_URL;
  const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;
  const privateKey = process.env.ESCROW_PRIVATE_KEY;

  if (!rpcUrl || !contractAddress || !privateKey) {
    throw new Error(
      'Missing Web3 env vars: ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, ESCROW_PRIVATE_KEY',
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(contractAddress, ABI, wallet) as unknown as EscrowContract;
}

/** Converts a DB ledger UUID to a bytes32 identifier for the contract. */
function ledgerIdToBytes32(ledgerId: string): string {
  // Remove dashes and left-pad to 32 bytes
  const hex = ledgerId.replace(/-/g, '');
  return '0x' + hex.padStart(64, '0');
}

// ── Public functions ──────────────────────────────────────────────────────────

export interface HoldResult {
  txHash: string;
  ledgerId: string;
  amountWei: string;
}

/**
 * holdFunds
 *
 * Calls `deposit(ledgerId)` on the escrow contract, attaching the given
 * amount in wei. The transaction is sent from the service wallet.
 *
 * @param ledgerId   DB UUID of the financial_ledger row.
 * @param amountUsd  Amount in USD — converted to ETH at a 1:1 stub rate.
 *                   In production, query a price oracle here.
 */
export async function holdFunds(
  ledgerId: string,
  amountUsd: number,
): Promise<HoldResult> {
  const contract = getContract();
  const bytes32Id = ledgerIdToBytes32(ledgerId);

  // Stub: treat 1 USD = 1 wei for testnet. Replace with oracle conversion in prod.
  const amountWei = ethers.parseUnits(amountUsd.toFixed(2), 'wei');

  const tx: ethers.TransactionResponse = await contract.deposit(bytes32Id, {
    value: amountWei,
  });
  await tx.wait();

  return { txHash: tx.hash, ledgerId, amountWei: amountWei.toString() };
}

export interface ReleaseResult {
  txHash: string;
  ledgerId: string;
}

/**
 * releaseFunds
 *
 * Calls `release(ledgerId, recipient)` on the escrow contract.
 * In production, `recipient` would be resolved from the agreement parties.
 *
 * @param ledgerId    DB UUID of the financial_ledger row.
 * @param recipient   Ethereum address of the payee.
 */
export async function releaseFunds(
  ledgerId: string,
  recipient: string,
): Promise<ReleaseResult> {
  const contract = getContract();
  const bytes32Id = ledgerIdToBytes32(ledgerId);

  const tx: ethers.TransactionResponse = await contract.release(bytes32Id, recipient);
  await tx.wait();

  return { txHash: tx.hash, ledgerId };
}

/**
 * getOnChainBalance
 *
 * Reads the on-chain balance held for a given ledger (in wei).
 * Used to cross-check DB state before releasing.
 */
export async function getOnChainBalance(ledgerId: string): Promise<bigint> {
  const contract = getContract();
  const bytes32Id = ledgerIdToBytes32(ledgerId);
  return (await contract.getBalance(bytes32Id)) as bigint;
}
