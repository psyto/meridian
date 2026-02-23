import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export function parsePublicKey(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid public key: ${value}`);
  }
}

export function parseAmount(value: string): anchor.BN {
  const n = Number(value);
  if (isNaN(n) || n < 0 || !Number.isFinite(n)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return new anchor.BN(value);
}

export function parseHexBytes(value: string, length: number): number[] {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length !== length * 2) {
    throw new Error(
      `Expected ${length} bytes (${length * 2} hex chars), got ${hex.length} chars`
    );
  }
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

export function parseOptionalHexBytes(
  value: string | undefined,
  length: number
): number[] {
  if (!value) return Array(length).fill(0);
  return parseHexBytes(value, length);
}

const PRESET_MAP: Record<string, object> = {
  sss1: { sss1: {} },
  sss2: { sss2: {} },
  custom: { custom: {} },
};

export function parsePreset(value: string): object {
  const key = value.toLowerCase();
  const result = PRESET_MAP[key];
  if (!result) {
    throw new Error(
      `Invalid preset: ${value}. Expected: sss1, sss2, custom`
    );
  }
  return result;
}

const KYC_LEVEL_MAP: Record<string, object> = {
  basic: { basic: {} },
  standard: { standard: {} },
  enhanced: { enhanced: {} },
  institutional: { institutional: {} },
};

export function parseKycLevel(value: string): object {
  const key = value.toLowerCase();
  const result = KYC_LEVEL_MAP[key];
  if (!result) {
    throw new Error(
      `Invalid KYC level: ${value}. Expected: basic, standard, enhanced, institutional`
    );
  }
  return result;
}

const JURISDICTION_MAP: Record<string, object> = {
  japan: { japan: {} },
  singapore: { singapore: {} },
  hongkong: { hongKong: {} },
  "hong-kong": { hongKong: {} },
  eu: { eu: {} },
  usa: { usa: {} },
  other: { other: {} },
};

export function parseJurisdiction(value: string): object {
  const key = value.toLowerCase();
  const result = JURISDICTION_MAP[key];
  if (!result) {
    throw new Error(
      `Invalid jurisdiction: ${value}. Expected: japan, singapore, hongkong, eu, usa, other`
    );
  }
  return result;
}

const ISSUER_TYPE_MAP: Record<string, object> = {
  trustbank: { trustBank: {} },
  "trust-bank": { trustBank: {} },
  distributor: { distributor: {} },
  exchange: { exchange: {} },
  apipartner: { apiPartner: {} },
  "api-partner": { apiPartner: {} },
};

export function parseIssuerType(value: string): object {
  const key = value.toLowerCase();
  const result = ISSUER_TYPE_MAP[key];
  if (!result) {
    throw new Error(
      `Invalid issuer type: ${value}. Expected: trust-bank, distributor, exchange, api-partner`
    );
  }
  return result;
}

const COLLATERAL_TYPE_MAP: Record<string, object> = {
  fiat: { fiat: {} },
  governmentbond: { governmentBond: {} },
  "government-bond": { governmentBond: {} },
  bankdeposit: { bankDeposit: {} },
  "bank-deposit": { bankDeposit: {} },
  other: { other: {} },
};

export function parseCollateralType(value: string): object {
  const key = value.toLowerCase();
  const result = COLLATERAL_TYPE_MAP[key];
  if (!result) {
    throw new Error(
      `Invalid collateral type: ${value}. Expected: fiat, government-bond, bank-deposit, other`
    );
  }
  return result;
}
