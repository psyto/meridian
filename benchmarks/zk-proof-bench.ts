/**
 * ZK Compliance Proof Benchmark
 *
 * Measures latency of commitment computation, proof generation, and proof
 * verification using the configured ProofBackend.
 *
 * Run: npx tsx benchmarks/zk-proof-bench.ts
 */

import {
  ZkComplianceProver,
  computeCommitment,
  createJurisdictionBitmask,
  ZkKycLevel,
  ZkJurisdiction,
  PlaceholderBackend,
} from '../packages/sdk/src/index';
import type { KycWitness, ProofBackend } from '../packages/sdk/src/index';

// ── Configuration ──────────────────────────────────────────────────────

const ITERATIONS = 100;

const jurisdictionBitmask = createJurisdictionBitmask([
  ZkJurisdiction.Japan,
  ZkJurisdiction.Singapore,
  ZkJurisdiction.EU,
]);

function makeWitness(): KycWitness {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const salt = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    kycLevel: ZkKycLevel.Enhanced,
    jurisdiction: ZkJurisdiction.Japan,
    expiry: Math.floor(Date.now() / 1000) + 365 * 86400,
    salt,
  };
}

// ── Statistics ──────────────────────────────────────────────────────────

interface Stats {
  label: string;
  min: number;
  avg: number;
  max: number;
  p95: number;
  iterations: number;
}

function computeStats(label: string, durationsMs: number[]): Stats {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;

  return {
    label,
    min: sorted[0],
    avg: sum / sorted.length,
    max: sorted[sorted.length - 1],
    p95: sorted[p95Index],
    iterations: sorted.length,
  };
}

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)} us`;
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  return `${ms.toFixed(2)} ms`;
}

function printTable(rows: Stats[]) {
  const header = ['Operation', 'Iterations', 'Min', 'Avg', 'P95', 'Max'];
  const data = rows.map(r => [
    r.label,
    r.iterations.toString(),
    formatMs(r.min),
    formatMs(r.avg),
    formatMs(r.p95),
    formatMs(r.max),
  ]);

  // Calculate column widths
  const widths = header.map((h, i) =>
    Math.max(h.length, ...data.map(row => row[i].length))
  );

  const sep = widths.map(w => '-'.repeat(w + 2)).join('+');
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${cell.padEnd(widths[i])} `).join('|');

  console.log('');
  console.log(formatRow(header));
  console.log(sep);
  for (const row of data) {
    console.log(formatRow(row));
  }
  console.log('');
}

// ── Benchmark Runner ───────────────────────────────────────────────────

async function benchCommitment(witnesses: KycWitness[]): Promise<Stats> {
  const durations: number[] = [];

  for (const w of witnesses) {
    const start = performance.now();
    computeCommitment(w);
    durations.push(performance.now() - start);
  }

  return computeStats('Commitment', durations);
}

async function benchProofGeneration(
  prover: ZkComplianceProver,
  witnesses: KycWitness[],
): Promise<Stats> {
  const durations: number[] = [];

  for (const w of witnesses) {
    const start = performance.now();
    await prover.generateProof(w, ZkKycLevel.Basic, jurisdictionBitmask);
    durations.push(performance.now() - start);
  }

  return computeStats('Proof Generation', durations);
}

async function benchProofVerification(
  prover: ZkComplianceProver,
  witnesses: KycWitness[],
): Promise<Stats> {
  // Pre-generate proofs
  const proofs = [];
  for (const w of witnesses) {
    proofs.push(await prover.generateProof(w, ZkKycLevel.Basic, jurisdictionBitmask));
  }

  const durations: number[] = [];

  for (const proof of proofs) {
    const start = performance.now();
    await prover.verifyProof(proof);
    durations.push(performance.now() - start);
  }

  return computeStats('Proof Verification', durations);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Meridian ZK Compliance Proof Benchmark ===');
  console.log(`Backend: PlaceholderBackend (SHA-256)`);
  console.log(`Iterations: ${ITERATIONS}`);

  const backend: ProofBackend = new PlaceholderBackend();
  const prover = new ZkComplianceProver(backend);

  // Pre-generate unique witnesses for each iteration
  const witnesses = Array.from({ length: ITERATIONS }, () => makeWitness());

  // Warm up (5 iterations, discarded)
  console.log('\nWarming up...');
  const warmupWitnesses = Array.from({ length: 5 }, () => makeWitness());
  for (const w of warmupWitnesses) {
    computeCommitment(w);
    const p = await prover.generateProof(w, ZkKycLevel.Basic, jurisdictionBitmask);
    await prover.verifyProof(p);
  }

  console.log('Running benchmarks...');

  const commitmentStats = await benchCommitment(witnesses);
  const proveStats = await benchProofGeneration(prover, witnesses);
  const verifyStats = await benchProofVerification(prover, witnesses);

  printTable([commitmentStats, proveStats, verifyStats]);

  // Summary
  const totalAvg = commitmentStats.avg + proveStats.avg + verifyStats.avg;
  console.log(`Total avg round-trip (commit + prove + verify): ${formatMs(totalAvg)}`);
  console.log('');
  console.log('Note: PlaceholderBackend uses SHA-256 hashing, not real ZK proofs.');
  console.log('Connect the NoirBackend to measure actual proof latency.');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
