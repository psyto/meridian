import { OrderMatcher, MerkleTree, Bitfield } from '@fabrknt/stratum-core';
import type { OrderBookLevel, OrderBook } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecuritiesOrder {
  id: string;
  market: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  createdAt: number;
  expiresAt: number;
}

export interface MatchedTrade {
  makerId: string;
  takerId: string;
  fillAmount: number;
  fillPrice: number;
}

// ---------------------------------------------------------------------------
// Securities Order Matching Engine
// ---------------------------------------------------------------------------

const matcher = new OrderMatcher();

/**
 * Match buy and sell orders for a securities market using price-time priority.
 *
 * Bids must be sorted descending by price, asks ascending by price.
 * Uses @fabrknt/stratum-core OrderMatcher for deterministic, auditable matching.
 */
export function matchSecuritiesOrders(
  bids: SecuritiesOrder[],
  asks: SecuritiesOrder[],
): MatchedTrade[] {
  const bidOrders = bids.map((b) => ({
    ...b,
    price: b.price,
    amount: b.amount,
    createdAt: b.createdAt,
    expiresAt: b.expiresAt,
  }));
  const askOrders = asks.map((a) => ({
    ...a,
    price: a.price,
    amount: a.amount,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
  }));

  const matches = matcher.findMatches(bidOrders, askOrders);

  return matches.map((m) => ({
    makerId: m.makerOrder.id,
    takerId: m.takerOrder.id,
    fillAmount: m.fillAmount,
    fillPrice: m.fillPrice,
  }));
}

/**
 * Get the current spread and mid-price for a market.
 */
export function getMarketMetrics(
  bids: SecuritiesOrder[],
  asks: SecuritiesOrder[],
): { spread: number | null; midPrice: number | null } {
  return {
    spread: matcher.getSpread(bids, asks),
    midPrice: matcher.getMidPrice(bids, asks),
  };
}

/**
 * Get depth at a specific price level.
 */
export function getDepthAtPrice(orders: SecuritiesOrder[], price: number): number {
  return matcher.getDepthAtPrice(orders, price);
}

// ---------------------------------------------------------------------------
// RWA Ownership Merkle Proofs
// ---------------------------------------------------------------------------

/**
 * Build a merkle tree from RWA ownership records.
 * Each leaf encodes `ownerAddress:assetId:amount`.
 *
 * Used for compact on-chain proof-of-ownership verification
 * and batch dividend claim eligibility.
 */
export function buildOwnershipTree(
  records: Array<{ owner: string; assetId: string; amount: string }>,
): MerkleTree {
  const leaves = records.map(
    (r) => `${r.owner}:${r.assetId}:${r.amount}`,
  );
  return new MerkleTree(leaves);
}

/**
 * Generate a merkle proof for a specific ownership record.
 */
export function getOwnershipProof(
  tree: MerkleTree,
  owner: string,
  assetId: string,
  amount: string,
): { proof: number[][]; root: number[]; index: number } {
  const index = tree.findLeafIndex(`${owner}:${assetId}:${amount}`);
  if (index < 0) throw new Error('Ownership record not found in tree');
  return {
    proof: tree.getProofArray(index),
    root: tree.rootArray,
    index,
  };
}

// ---------------------------------------------------------------------------
// Order Settlement Tracking
// ---------------------------------------------------------------------------

/**
 * Track which orders in an epoch have been settled using a compact bitfield.
 * Each bit represents one order slot — 256 bytes tracks 2048 orders.
 */
export function createSettlementTracker(capacity?: number): Bitfield {
  return new Bitfield(capacity);
}
