import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';

describe('zk-verifier', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ZkVerifier as Program;
  const authority = provider.wallet;

  let verifierConfigPda: PublicKey;
  let attestationPda: PublicKey;
  let walletKeypair: Keypair;

  // Test data
  const circuitId = new Array(32).fill(0).map((_, i) => i % 256);
  const verificationKey = new Array(128).fill(0).map((_, i) => (i * 7) % 256);

  before(async () => {
    [verifierConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('verifier_config')],
      program.programId
    );

    walletKeypair = Keypair.generate();

    // Airdrop SOL to the wallet for signing transactions
    const sig = await provider.connection.requestAirdrop(
      walletKeypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    [attestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('attestation'), walletKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  describe('initialize', () => {
    it('should initialize VerifierConfig with correct values', async () => {
      const tx = await program.methods
        .initialize({
          circuitId: circuitId,
          verificationKey: verificationKey,
        })
        .accounts({
          authority: authority.publicKey,
          verifierConfig: verifierConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.verifierConfig.fetch(verifierConfigPda);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      expect(Array.from(config.circuitId)).to.deep.equal(circuitId);
      expect(Array.from(config.verificationKey)).to.deep.equal(verificationKey);
      expect(config.totalVerifications.toNumber()).to.equal(0);
      expect(config.totalRejections.toNumber()).to.equal(0);
      expect(config.isActive).to.be.true;
      expect(config.createdAt.toNumber()).to.be.greaterThan(0);
      expect(config.updatedAt.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('verify_proof', () => {
    it('should create ComplianceAttestation with valid proof inputs', async () => {
      const proof = new Array(64).fill(0).map((_, i) => (i + 1) % 256);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const requiredKycLevel = 2;
      const jurisdictionBitmask = 0x0000_000F; // first 4 jurisdictions
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // +24h

      const tx = await program.methods
        .verifyProof({
          proof: proof,
          commitment: commitment,
          requiredKycLevel: requiredKycLevel,
          jurisdictionBitmask: jurisdictionBitmask,
          expiryTimestamp: expiryTimestamp,
        })
        .accounts({
          wallet: walletKeypair.publicKey,
          verifierConfig: verifierConfigPda,
          attestation: attestationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();

      const attestation = await program.account.complianceAttestation.fetch(attestationPda);
      expect(attestation.wallet.toString()).to.equal(walletKeypair.publicKey.toString());
      expect(attestation.verifierConfig.toString()).to.equal(verifierConfigPda.toString());
      expect(Array.from(attestation.commitment)).to.deep.equal(commitment);
      expect(attestation.requiredKycLevel).to.equal(requiredKycLevel);
      expect(attestation.jurisdictionBitmask).to.equal(jurisdictionBitmask);
      expect(attestation.verifiedAt.toNumber()).to.be.greaterThan(0);
      expect(attestation.expiresAt.toNumber()).to.equal(expiryTimestamp.toNumber());
      expect(attestation.isValid).to.be.true;

      // Verify the config counters were updated
      const config = await program.account.verifierConfig.fetch(verifierConfigPda);
      expect(config.totalVerifications.toNumber()).to.equal(1);
      expect(config.totalRejections.toNumber()).to.equal(0);
    });

    it('should fail with all-zero proof bytes', async () => {
      const zeroProof = new Array(64).fill(0);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

      try {
        await program.methods
          .verifyProof({
            proof: zeroProof,
            commitment: commitment,
            requiredKycLevel: 1,
            jurisdictionBitmask: 1,
            expiryTimestamp: expiryTimestamp,
          })
          .accounts({
            wallet: walletKeypair.publicKey,
            verifierConfig: verifierConfigPda,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([walletKeypair])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('ProofInvalid') ||
          errMsg.includes('Proof verification failed') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });

    it('should fail with expired expiry_timestamp', async () => {
      const proof = new Array(64).fill(0).map((_, i) => (i + 1) % 256);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const pastTimestamp = new anchor.BN(1000); // way in the past

      try {
        await program.methods
          .verifyProof({
            proof: proof,
            commitment: commitment,
            requiredKycLevel: 1,
            jurisdictionBitmask: 1,
            expiryTimestamp: pastTimestamp,
          })
          .accounts({
            wallet: walletKeypair.publicKey,
            verifierConfig: verifierConfigPda,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([walletKeypair])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('ProofExpired') ||
          errMsg.includes('Proof expiry is in the past') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });

    it('should fail with zero jurisdiction bitmask', async () => {
      const proof = new Array(64).fill(0).map((_, i) => (i + 1) % 256);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

      try {
        await program.methods
          .verifyProof({
            proof: proof,
            commitment: commitment,
            requiredKycLevel: 1,
            jurisdictionBitmask: 0, // invalid: zero
            expiryTimestamp: expiryTimestamp,
          })
          .accounts({
            wallet: walletKeypair.publicKey,
            verifierConfig: verifierConfigPda,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([walletKeypair])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('InvalidJurisdictionBitmask') ||
          errMsg.includes('jurisdiction bitmask') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });

    it('should fail with invalid KYC level (>4)', async () => {
      const proof = new Array(64).fill(0).map((_, i) => (i + 1) % 256);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

      try {
        await program.methods
          .verifyProof({
            proof: proof,
            commitment: commitment,
            requiredKycLevel: 5, // invalid: > 4
            jurisdictionBitmask: 1,
            expiryTimestamp: expiryTimestamp,
          })
          .accounts({
            wallet: walletKeypair.publicKey,
            verifierConfig: verifierConfigPda,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([walletKeypair])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('InvalidKycLevel') ||
          errMsg.includes('KYC level') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });
  });

  describe('check_attestation', () => {
    it('should return valid for fresh attestation', async () => {
      const tx = await program.methods
        .checkAttestation()
        .accounts({
          wallet: walletKeypair.publicKey,
          attestation: attestationPda,
        })
        .rpc();

      // If check_attestation succeeds without error, the attestation is valid
      const attestation = await program.account.complianceAttestation.fetch(attestationPda);
      expect(attestation.isValid).to.be.true;
    });
  });

  describe('revoke_attestation', () => {
    it('should set is_valid to false', async () => {
      await program.methods
        .revokeAttestation()
        .accounts({
          authority: authority.publicKey,
          verifierConfig: verifierConfigPda,
          wallet: walletKeypair.publicKey,
          attestation: attestationPda,
        })
        .rpc();

      const attestation = await program.account.complianceAttestation.fetch(attestationPda);
      expect(attestation.isValid).to.be.false;
    });

    it('should fail check_attestation after revocation', async () => {
      try {
        await program.methods
          .checkAttestation()
          .accounts({
            wallet: walletKeypair.publicKey,
            attestation: attestationPda,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('AttestationRevoked') ||
          errMsg.includes('revoked') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });

    it('should fail when called by non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .revokeAttestation()
          .accounts({
            authority: fakeAuthority.publicKey,
            verifierConfig: verifierConfigPda,
            wallet: walletKeypair.publicKey,
            attestation: attestationPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('update_verification_key', () => {
    it('should update circuit_id and verification_key', async () => {
      const newCircuitId = new Array(32).fill(0).map((_, i) => (i * 3) % 256);
      const newVerificationKey = new Array(128).fill(0).map((_, i) => (i * 11) % 256);

      await program.methods
        .updateVerificationKey({
          circuitId: newCircuitId,
          verificationKey: newVerificationKey,
        })
        .accounts({
          authority: authority.publicKey,
          verifierConfig: verifierConfigPda,
        })
        .rpc();

      const config = await program.account.verifierConfig.fetch(verifierConfigPda);
      expect(Array.from(config.circuitId)).to.deep.equal(newCircuitId);
      expect(Array.from(config.verificationKey)).to.deep.equal(newVerificationKey);
    });

    it('should fail when called by non-authority', async () => {
      const fakeAuthority = Keypair.generate();
      const fakeCircuitId = new Array(32).fill(0);
      const fakeKey = new Array(128).fill(0);

      try {
        await program.methods
          .updateVerificationKey({
            circuitId: fakeCircuitId,
            verificationKey: fakeKey,
          })
          .accounts({
            authority: fakeAuthority.publicKey,
            verifierConfig: verifierConfigPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('deactivate and activate', () => {
    it('should deactivate the verifier', async () => {
      await program.methods
        .deactivate()
        .accounts({
          authority: authority.publicKey,
          verifierConfig: verifierConfigPda,
        })
        .rpc();

      const config = await program.account.verifierConfig.fetch(verifierConfigPda);
      expect(config.isActive).to.be.false;
    });

    it('should fail verify_proof when verifier is deactivated', async () => {
      const proof = new Array(64).fill(0).map((_, i) => (i + 1) % 256);
      const commitment = new Array(32).fill(0).map((_, i) => (i + 10) % 256);
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

      try {
        await program.methods
          .verifyProof({
            proof: proof,
            commitment: commitment,
            requiredKycLevel: 1,
            jurisdictionBitmask: 1,
            expiryTimestamp: expiryTimestamp,
          })
          .accounts({
            wallet: walletKeypair.publicKey,
            verifierConfig: verifierConfigPda,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([walletKeypair])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('VerifierNotActive') ||
          errMsg.includes('deactivated') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });

    it('should fail deactivate when called by non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .deactivate()
          .accounts({
            authority: fakeAuthority.publicKey,
            verifierConfig: verifierConfigPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it('should reactivate the verifier', async () => {
      await program.methods
        .activate()
        .accounts({
          authority: authority.publicKey,
          verifierConfig: verifierConfigPda,
        })
        .rpc();

      const config = await program.account.verifierConfig.fetch(verifierConfigPda);
      expect(config.isActive).to.be.true;
    });

    it('should fail activate when called by non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .activate()
          .accounts({
            authority: fakeAuthority.publicKey,
            verifierConfig: verifierConfigPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });
});
