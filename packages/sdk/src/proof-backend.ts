import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { KycWitness, CompliancePublicInputs } from './zk-prover';

const execFileAsync = promisify(execFile);

/**
 * Interface for pluggable ZK proof backends.
 *
 * Implementations generate and verify proofs for the compliance circuit.
 * The proof format and verification semantics depend on the backend:
 * - PlaceholderBackend: SHA-256 based, suitable for testing
 * - NoirBackend: Delegates to nargo/bb CLI for real ZK proofs
 */
export interface ProofBackend {
  /**
   * Generate a proof from witness and public inputs.
   * @returns Hex-encoded proof string
   */
  prove(witness: KycWitness, publicInputs: CompliancePublicInputs): Promise<string>;

  /**
   * Verify a proof against its public inputs.
   * @returns true if the proof is valid
   * @throws on verification failure with a descriptive message
   */
  verify(proof: string, publicInputs: CompliancePublicInputs): Promise<boolean>;
}

/**
 * SHA-256 based placeholder backend for testing and development.
 *
 * **SECURITY WARNING: This backend provides NO real zero-knowledge guarantees.**
 *
 * - prove() hashes the witness + public inputs with SHA-256 (the "proof"
 *   contains the witness data in its preimage, so it is trivially forgeable)
 * - verify() checks structural validity of public inputs only (it does NOT
 *   verify the proof cryptographically)
 * - The on-chain zk-verifier program's verify_proof_inputs() only checks
 *   that proof bytes are non-zero, so ANY non-zero bytes pass verification
 *
 * This backend exists solely for integration testing and development.
 * For production, use NoirBackend which delegates to nargo/bb for real
 * ZK proof generation and verification.
 *
 * Not cryptographically sound -- use NoirBackend for production.
 */
export class PlaceholderBackend implements ProofBackend {
  async prove(witness: KycWitness, publicInputs: CompliancePublicInputs): Promise<string> {
    const proofData = {
      w: {
        kl: witness.kycLevel,
        j: witness.jurisdiction,
        e: witness.expiry,
        s: witness.salt,
      },
      p: {
        rkl: publicInputs.requiredKycLevel,
        jb: publicInputs.jurisdictionBitmask,
        ct: publicInputs.currentTimestamp,
        c: publicInputs.commitment,
      },
    };

    const hash = createHash('sha256');
    hash.update(JSON.stringify(proofData));
    return hash.digest('hex');
  }

  async verify(_proof: string, publicInputs: CompliancePublicInputs): Promise<boolean> {
    if (publicInputs.requiredKycLevel < 0 || publicInputs.requiredKycLevel > 4) {
      throw new Error('Invalid required KYC level');
    }
    if (publicInputs.jurisdictionBitmask === 0) {
      throw new Error('Empty jurisdiction bitmask');
    }
    if (!publicInputs.commitment) {
      throw new Error('Missing commitment');
    }
    return true;
  }
}

/**
 * Production backend that delegates to Noir toolchain (nargo + bb).
 *
 * Proof generation:
 *   1. Writes witness to a temp Prover.toml
 *   2. Calls `nargo prove` on the compliance_proof circuit
 *   3. Reads the proof artifact from the circuit's proofs/ directory
 *
 * Proof verification:
 *   1. Calls `bb verify` (Barretenberg) with the proof and verification key
 *
 * Requires nargo and bb to be installed and on PATH.
 * Falls back to clear error messages when binaries are missing.
 */
export class NoirBackend implements ProofBackend {
  private readonly circuitDir: string;
  private readonly nargoBin: string;
  private readonly bbBin: string;

  /**
   * @param circuitDir - Path to the Noir circuit directory (containing Nargo.toml).
   *                     Defaults to `circuits/compliance_proof/` relative to project root.
   * @param nargoBin - Path to the nargo binary. Defaults to 'nargo' (resolved via PATH).
   * @param bbBin - Path to the bb (Barretenberg) binary. Defaults to 'bb' (resolved via PATH).
   */
  constructor(options?: {
    circuitDir?: string;
    nargoBin?: string;
    bbBin?: string;
  }) {
    this.circuitDir = options?.circuitDir ?? 'circuits/compliance_proof';
    this.nargoBin = options?.nargoBin ?? 'nargo';
    this.bbBin = options?.bbBin ?? 'bb';
  }

  async prove(witness: KycWitness, publicInputs: CompliancePublicInputs): Promise<string> {
    await this.ensureBinaryExists(this.nargoBin, 'nargo');

    // Create a temporary directory for the Prover.toml
    const tempDir = await mkdtemp(join(tmpdir(), 'meridian-noir-'));

    try {
      // Write witness and public inputs in TOML format for nargo
      const proverToml = this.buildProverToml(witness, publicInputs);
      const proverTomlPath = join(this.circuitDir, 'Prover.toml');
      await writeFile(proverTomlPath, proverToml, 'utf-8');

      // Run nargo prove
      try {
        await execFileAsync(this.nargoBin, ['prove'], {
          cwd: this.circuitDir,
          timeout: 120_000, // 2 minute timeout for proof generation
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`nargo prove failed: ${msg}`);
      }

      // Read the generated proof artifact
      const proofPath = join(this.circuitDir, 'proofs', 'compliance_proof.proof');
      try {
        const proofBytes = await readFile(proofPath);
        return proofBytes.toString('hex');
      } catch {
        throw new Error(
          `Failed to read proof artifact at ${proofPath}. ` +
          'Ensure nargo prove completed successfully.'
        );
      }
    } finally {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async verify(proof: string, publicInputs: CompliancePublicInputs): Promise<boolean> {
    await this.ensureBinaryExists(this.bbBin, 'bb');

    // Write proof to a temp file for bb verify
    const tempDir = await mkdtemp(join(tmpdir(), 'meridian-bb-'));

    try {
      const proofPath = join(tempDir, 'proof');
      const vkPath = join(this.circuitDir, 'target', 'vk');

      await writeFile(proofPath, Buffer.from(proof, 'hex'));

      // Write public inputs as a JSON file for bb
      const pubInputsPath = join(tempDir, 'public_inputs.json');
      await writeFile(pubInputsPath, JSON.stringify({
        required_kyc_level: publicInputs.requiredKycLevel.toString(),
        jurisdiction_bitmask: publicInputs.jurisdictionBitmask.toString(),
        current_timestamp: publicInputs.currentTimestamp.toString(),
        commitment: publicInputs.commitment,
      }), 'utf-8');

      try {
        await execFileAsync(this.bbBin, [
          'verify',
          '-p', proofPath,
          '-k', vkPath,
        ], {
          cwd: this.circuitDir,
          timeout: 30_000, // 30 second timeout for verification
        });
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`bb verify failed: ${msg}`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Build a Prover.toml file content from witness and public inputs.
   * This follows the TOML format expected by nargo.
   */
  private buildProverToml(witness: KycWitness, publicInputs: CompliancePublicInputs): string {
    const lines: string[] = [
      '# Auto-generated by Meridian SDK NoirBackend',
      `kyc_level = "${witness.kycLevel}"`,
      `jurisdiction = "${witness.jurisdiction}"`,
      `expiry = "${witness.expiry}"`,
      `salt = "${witness.salt}"`,
      `required_kyc_level = "${publicInputs.requiredKycLevel}"`,
      `jurisdiction_bitmask = "${publicInputs.jurisdictionBitmask}"`,
      `current_timestamp = "${publicInputs.currentTimestamp}"`,
      `commitment = "${publicInputs.commitment}"`,
    ];
    return lines.join('\n') + '\n';
  }

  /**
   * Check that a required binary exists and is executable.
   * Throws a clear, actionable error if not found.
   */
  private async ensureBinaryExists(bin: string, name: string): Promise<void> {
    try {
      await execFileAsync('which', [bin]);
    } catch {
      throw new Error(
        `${name} binary not found. ` +
        `Install the Noir toolchain: https://noir-lang.org/docs/getting_started/installation/ ` +
        `Looked for: ${bin}`
      );
    }
  }
}
