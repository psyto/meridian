# Trust Scheme Legal Validation Checklist

Working checklist for the Trust-type Class 3 Electronic Payment Instrument scheme under Japanese law.

## Legal Structure Summary

- **Issuer**: Trust Bank (licensed trust company under the Trust Business Act)
- **Instrument classification**: Class 3 Electronic Payment Instrument (PSA Art. 2, Para. 5, Item 3)
- **Mechanism**: Trust Bank issues stablecoin tokens representing beneficial interests in a money trust
- **Redemption**: 1:1 JPY redemption guaranteed by the trust structure
- **Regulatory anchor**: Payment Services Act (PSA) as amended June 2023, effective June 2024

## Key Legal Questions for JFSA Confirmation

1. **Token-2022 transfer hooks as compliance enforcement** -- Does programmatic transfer restriction via Token-2022 hooks satisfy the PSA requirement for "measures to ensure appropriate management" of electronic payment instruments?

2. **ZK compliance proofs as KYC evidence** -- Can a zero-knowledge proof attesting to KYC completion (without revealing identity) satisfy the JFSA's transaction monitoring expectations under the Act on Prevention of Transfer of Criminal Proceeds?

3. **Confidential transfer amounts** -- Does hiding transfer amounts via homomorphic encryption conflict with the trust bank's obligation to maintain transaction records under the Trust Business Act?

4. **Cross-jurisdiction transfers** -- When a Japan-issued trust stablecoin is transferred to a wallet in Singapore/HK, which jurisdiction's electronic payment instrument rules apply to the recipient?

5. **On-chain attestation as regulatory record** -- Can the on-chain `ComplianceAttestation` PDA (created by the `zk-verifier` program at `ZKVRFYxR3Ge8mTnUXzKnFHB1aLNhWMdP5DUNbvX91Kt`) serve as the "record of measures taken" required by PSA Art. 62-8?

6. **Shield escrow as intermediary** -- Does the shield-escrow PDA (at `SHLDxR5GtSjk4FGebmqZBfLSuGhWMaWM46U9DjMkfWF`) qualify as a "compliant intermediary" or does routing through it create a new regulatory classification for the escrow operator?

## On-Chain Mechanisms to Legal Requirements Mapping

| Legal Requirement | PSA Reference | On-Chain Mechanism | Program | Status |
|---|---|---|---|---|
| Issuer identification | Art. 62-3 | Mint authority held by Trust Bank multisig | `meridian-stablecoin` | Implemented |
| Redemption guarantee | Art. 62-5 | Burn-and-redeem instruction with trust escrow | `meridian-stablecoin` | Implemented |
| Transfer restrictions | Art. 62-8 | Token-2022 transfer hook (whitelist check) | `transfer-hook` | Implemented |
| KYC/AML screening | Art. 62-8, APTCP | ZK compliance proof + on-chain attestation | `zk-verifier` | Implemented |
| Transaction monitoring | Art. 62-9 | Transfer hook event logging + indexer | `transfer-hook` | In progress |
| Confidential amounts | N/A (no prohibition) | Application-layer ZK proofs (not Token-2022 confidential transfers) | `zk-verifier` | Implemented |
| Jurisdiction controls | Art. 62-8 | Jurisdiction bitmask in transfer hook + ZK proof | `transfer-hook`, `zk-verifier` | Implemented |
| Custody requirements | Trust Business Act | Trust Bank custodies reserve assets | Operational | Operational |
| Compliant liquidity access | Art. 62-8 | Shield escrow with transfer hook enforcement on deposit/withdraw | `shield-escrow` | Implemented |
| Verifier kill switch | Art. 62-8 | Authority can deactivate verifier and revoke attestations | `zk-verifier` | Implemented |

## Technical Implementation Details

### ZK Compliance Proof System

The Noir circuit (`circuits/compliance_proof/src/main.nr`) enforces:
1. `kyc_level >= required_kyc_level` (private KYC level meets public minimum)
2. `jurisdiction` bit is set in `jurisdiction_bitmask` (private jurisdiction is allowed)
3. `expiry > current_timestamp` (KYC has not expired)
4. Pedersen commitment matches private inputs (proof is bound to specific attributes)

The `ZkComplianceProver` (TypeScript) generates proofs client-side. The `zk-verifier` program verifies proofs on-chain and creates `ComplianceAttestation` PDAs that persist until revoked or expired.

### Shield Escrow Compliance Flow

```
Trader → deposit (transfer hook validates KYC) → Shield Escrow PDA
Shield Escrow PDA → Jupiter swap (no KYC needed, PDA is whitelisted)
Shield Escrow PDA → withdraw (transfer hook validates KYC) → Trader
```

Both the deposit and withdrawal transfers pass through the Token-2022 transfer hook, ensuring the trader is KYC-verified. The escrow PDA itself is whitelisted in the compliant registry. Protocol fees are collected on execution.

### Attestation Lifecycle

1. Trader generates ZK proof via `ZkComplianceProver` (client-side)
2. Trader submits proof on-chain via `zk-verifier.verify_proof`
3. `ComplianceAttestation` PDA is created/updated with KYC level, jurisdiction bitmask, and expiry
4. Other programs (transfer hook, shield escrow) can check attestation validity
5. Authority can revoke attestations via `revoke_attestation`
6. Authority can deactivate the entire verifier via `deactivate` (kill switch)

## Open Items for Legal Counsel

- [ ] Confirm that ZK proofs satisfy "know your customer" obligations or whether the trust bank must independently verify identity (even if the ZK circuit attests to it)
- [ ] Determine whether the transfer hook's whitelist model constitutes a "closed-loop" system that changes the regulatory classification
- [ ] Assess whether the application-layer ZK approach (vs Token-2022 confidential transfers) changes the regulatory analysis for transaction privacy
- [ ] Clarify the trust bank's liability scope when a transfer hook fails to block a non-compliant transfer due to a bug
- [ ] Review whether the Solana validator set (non-Japanese nodes) creates issues under data localization guidance
- [ ] Confirm that the mint/burn model (not account-balance model) aligns with JFSA's expectations for electronic payment instrument issuance
- [ ] Evaluate if the multi-jurisdiction bitmask approach needs bilateral agreements with foreign regulators (MAS, SFC, etc.)
- [ ] Determine record retention period for on-chain attestations and whether chain immutability satisfies or complicates the requirement
- [ ] Assess the regulatory classification of the shield escrow PDA — is it an intermediary, a pooled account, or a technical mechanism that doesn't require separate licensing?
- [ ] Confirm that the `deactivate` kill switch on the zk-verifier satisfies emergency response requirements under PSA Art. 62-8
- [ ] Review whether `SwapReceipt` on-chain records in shield-escrow satisfy transaction record-keeping obligations
