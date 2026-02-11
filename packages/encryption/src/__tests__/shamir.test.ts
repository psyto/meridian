import { describe, it, expect } from 'vitest';
import { ShamirSecretSharing } from '../shamir';

describe('ShamirSecretSharing', () => {
  describe('constructor validation', () => {
    it('throws when threshold < 2', () => {
      expect(
        () => new ShamirSecretSharing({ threshold: 1, totalShares: 3 })
      ).toThrow('Threshold must be at least 2');
    });

    it('throws when threshold > totalShares', () => {
      expect(
        () => new ShamirSecretSharing({ threshold: 4, totalShares: 3 })
      ).toThrow('Threshold cannot exceed total shares');
    });

    it('throws when totalShares > 255', () => {
      expect(
        () => new ShamirSecretSharing({ threshold: 2, totalShares: 256 })
      ).toThrow('Maximum 255 shares supported');
    });

    it('accepts valid config', () => {
      expect(
        () => new ShamirSecretSharing({ threshold: 2, totalShares: 3 })
      ).not.toThrow();
    });
  });

  describe('split', () => {
    it('returns the correct number of shares', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([42]);
      const shares = sss.split(secret);
      expect(shares.length).toBe(3);
    });

    it('each share has a 1-indexed index and data.length === secret.length', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 5 });
      const secret = new Uint8Array([10, 20, 30]);
      const shares = sss.split(secret);

      shares.forEach((share, i) => {
        expect(share.index).toBe(i + 1);
        expect(share.data.length).toBe(secret.length);
      });
    });
  });

  describe('reconstruct with exact threshold', () => {
    it('reconstructs from exactly 2 of 3 shares', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([42]);
      const shares = sss.split(secret);

      const result = sss.reconstruct([shares[0], shares[1]]);
      expect(result).toEqual(secret);
    });
  });

  describe('reconstruct with more than threshold', () => {
    it('reconstructs from all 3 shares on a 2-of-3 scheme', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([99]);
      const shares = sss.split(secret);

      const result = sss.reconstruct(shares);
      expect(result).toEqual(secret);
    });
  });

  describe('reconstruct with any subset', () => {
    it('every 2-share combination from 2-of-3 reconstructs correctly', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([7, 13, 200]);
      const shares = sss.split(secret);

      // All C(3,2) = 3 combinations
      const combos = [
        [shares[0], shares[1]],
        [shares[0], shares[2]],
        [shares[1], shares[2]],
      ];

      for (const combo of combos) {
        const result = sss.reconstruct(combo);
        expect(result).toEqual(secret);
      }
    });
  });

  describe('reconstruct with insufficient shares', () => {
    it('throws when given fewer shares than threshold', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([42]);
      const shares = sss.split(secret);

      expect(() => sss.reconstruct([shares[0]])).toThrow(
        'Need at least 2 shares, got 1'
      );
    });
  });

  describe('multi-byte secrets', () => {
    it('handles a 32-byte secret', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);

      const shares = sss.split(secret);
      const result = sss.reconstruct([shares[0], shares[2]]);
      expect(result).toEqual(secret);
    });

    it('handles a 64-byte secret', () => {
      const sss = new ShamirSecretSharing({ threshold: 3, totalShares: 5 });
      const secret = new Uint8Array(64);
      crypto.getRandomValues(secret);

      const shares = sss.split(secret);
      const result = sss.reconstruct([shares[0], shares[2], shares[4]]);
      expect(result).toEqual(secret);
    });
  });

  describe('larger configs', () => {
    it('3-of-5 split and reconstruct', () => {
      const sss = new ShamirSecretSharing({ threshold: 3, totalShares: 5 });
      const secret = new Uint8Array([11, 22, 33, 44, 55]);
      const shares = sss.split(secret);

      const result = sss.reconstruct([shares[1], shares[3], shares[4]]);
      expect(result).toEqual(secret);
    });

    it('5-of-10 split and reconstruct', () => {
      const sss = new ShamirSecretSharing({ threshold: 5, totalShares: 10 });
      const secret = new Uint8Array([100, 200, 50, 25, 75]);
      const shares = sss.split(secret);

      const result = sss.reconstruct([
        shares[0],
        shares[2],
        shares[4],
        shares[6],
        shares[8],
      ]);
      expect(result).toEqual(secret);
    });
  });

  describe('non-determinism', () => {
    it('splitting the same secret twice produces different shares but both reconstruct', () => {
      const sss = new ShamirSecretSharing({ threshold: 2, totalShares: 3 });
      const secret = new Uint8Array([42, 84]);

      const shares1 = sss.split(secret);
      const shares2 = sss.split(secret);

      // Shares should differ (random coefficients)
      const allSame = shares1.every(
        (s, i) =>
          s.data.every((byte, j) => byte === shares2[i].data[j])
      );
      expect(allSame).toBe(false);

      // Both should reconstruct to the original secret
      expect(sss.reconstruct(shares1)).toEqual(secret);
      expect(sss.reconstruct(shares2)).toEqual(secret);
    });
  });
});
