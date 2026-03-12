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

5. **On-chain attestation as regulatory record** -- Can the on-chain ComplianceAttestation PDA serve as the "record of measures taken" required by PSA Art. 62-8?

## On-Chain Mechanisms to Legal Requirements Mapping

| Legal Requirement | PSA Reference | On-Chain Mechanism | Status |
|---|---|---|---|
| Issuer identification | Art. 62-3 | Mint authority held by Trust Bank multisig | Implemented |
| Redemption guarantee | Art. 62-5 | Burn-and-redeem instruction with trust escrow | Implemented |
| Transfer restrictions | Art. 62-8 | Token-2022 transfer hook (whitelist check) | Implemented |
| KYC/AML screening | Art. 62-8, APTCP | ZK compliance proof + on-chain attestation | In progress |
| Transaction monitoring | Art. 62-9 | Transfer hook event logging + indexer | In progress |
| Confidential amounts | N/A (no prohibition) | Token-2022 confidential transfers | In progress |
| Jurisdiction controls | Art. 62-8 | Jurisdiction bitmask in transfer hook | Implemented |
| Custody requirements | Trust Business Act | Trust Bank custodies reserve assets | Operational |

## Open Items for Legal Counsel

- [ ] Confirm that ZK proofs satisfy "know your customer" obligations or whether the trust bank must independently verify identity (even if the ZK circuit attests to it)
- [ ] Determine whether the transfer hook's whitelist model constitutes a "closed-loop" system that changes the regulatory classification
- [ ] Assess whether Token-2022 confidential transfers require separate JFSA notification or approval
- [ ] Clarify the trust bank's liability scope when a transfer hook fails to block a non-compliant transfer due to a bug
- [ ] Review whether the Solana validator set (non-Japanese nodes) creates issues under data localization guidance
- [ ] Confirm that the mint/burn model (not account-balance model) aligns with JFSA's expectations for electronic payment instrument issuance
- [ ] Evaluate if the multi-jurisdiction bitmask approach needs bilateral agreements with foreign regulators (MAS, SFC, etc.)
- [ ] Determine record retention period for on-chain attestations and whether chain immutability satisfies or complicates the requirement
