import type { ShamirShare, ShamirConfig } from './types';

/**
 * Shamir's Secret Sharing implementation for threshold cryptography.
 *
 * Used for multi-party authorization of sensitive operations like:
 * - Emergency pause requiring M-of-N signatures
 * - Large mint/burn approval
 * - Compliance key recovery
 *
 * Operates over GF(256) for byte-level secret sharing.
 */
export class ShamirSecretSharing {
  private readonly totalShares: number;
  private readonly threshold: number;

  constructor(config: ShamirConfig) {
    if (config.threshold < 2) {
      throw new Error('Threshold must be at least 2');
    }
    if (config.threshold > config.totalShares) {
      throw new Error('Threshold cannot exceed total shares');
    }
    if (config.totalShares > 255) {
      throw new Error('Maximum 255 shares supported');
    }

    this.totalShares = config.totalShares;
    this.threshold = config.threshold;
  }

  /**
   * Split a secret into shares
   */
  split(secret: Uint8Array): ShamirShare[] {
    const shares: ShamirShare[] = Array.from({ length: this.totalShares }, (_, i) => ({
      index: i + 1,
      data: new Uint8Array(secret.length),
    }));

    for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
      // Generate random polynomial coefficients once per byte
      const coefficients = new Uint8Array(this.threshold);
      coefficients[0] = secret[byteIdx];

      // Random coefficients for degree 1..threshold-1
      const randomBytes = new Uint8Array(this.threshold - 1);
      crypto.getRandomValues(randomBytes);
      for (let c = 1; c < this.threshold; c++) {
        coefficients[c] = randomBytes[c - 1];
      }

      // Evaluate the same polynomial at each share point
      for (let i = 0; i < this.totalShares; i++) {
        shares[i].data[byteIdx] = this.evaluatePolynomial(coefficients, i + 1);
      }
    }

    return shares;
  }

  /**
   * Reconstruct a secret from shares
   */
  reconstruct(shares: ShamirShare[]): Uint8Array {
    if (shares.length < this.threshold) {
      throw new Error(
        `Need at least ${this.threshold} shares, got ${shares.length}`
      );
    }

    // Use only threshold number of shares
    const usedShares = shares.slice(0, this.threshold);
    const secretLength = usedShares[0].data.length;
    const result = new Uint8Array(secretLength);

    for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
      // Lagrange interpolation at x = 0
      let value = 0;

      for (let i = 0; i < usedShares.length; i++) {
        let basis = usedShares[i].data[byteIdx];

        for (let j = 0; j < usedShares.length; j++) {
          if (i === j) continue;

          const xi = usedShares[i].index;
          const xj = usedShares[j].index;

          // basis *= xj / (xj - xi) in GF(256)
          const num = xj;
          const den = gf256Sub(xj, xi);
          const ratio = gf256Div(num, den);
          basis = gf256Mul(basis, ratio);
        }

        value = gf256Add(value, basis);
      }

      result[byteIdx] = value;
    }

    return result;
  }

  /**
   * Evaluate a polynomial at a given point in GF(256)
   */
  private evaluatePolynomial(coefficients: Uint8Array, x: number): number {
    let result = 0;
    let power = 1;

    for (let i = 0; i < coefficients.length; i++) {
      result = gf256Add(result, gf256Mul(coefficients[i], power));
      power = gf256Mul(power, x);
    }

    return result;
  }
}

// GF(256) arithmetic using the irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11B)

function gf256Add(a: number, b: number): number {
  return a ^ b;
}

function gf256Sub(a: number, b: number): number {
  return a ^ b; // Same as add in GF(256)
}

function gf256Mul(a: number, b: number): number {
  let result = 0;
  let aa = a;
  let bb = b;

  for (let i = 0; i < 8; i++) {
    if (bb & 1) {
      result ^= aa;
    }
    const highBit = aa & 0x80;
    aa = (aa << 1) & 0xff;
    if (highBit) {
      aa ^= 0x1b; // Reduction polynomial
    }
    bb >>= 1;
  }

  return result;
}

function gf256Div(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero in GF(256)');
  }
  if (a === 0) return 0;

  // Use Fermat's little theorem: a/b = a * b^(254) in GF(256)
  return gf256Mul(a, gf256Pow(b, 254));
}

function gf256Pow(base: number, exp: number): number {
  let result = 1;
  let b = base;
  let e = exp;

  while (e > 0) {
    if (e & 1) {
      result = gf256Mul(result, b);
    }
    b = gf256Mul(b, b);
    e >>= 1;
  }

  return result;
}
