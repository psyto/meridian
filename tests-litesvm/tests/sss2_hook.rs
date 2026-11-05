//! SSS-2 stablecoin transfers and seizes through the Accredit transfer hook,
//! on real Token-2022 in LiteSVM.
//!
//! Instructions are assembled from raw bytes (Anchor discriminator + Borsh),
//! so this crate shares no code with the programs. Build first:
//!   cargo build-sbf --manifest-path programs/meridian-stablecoin/Cargo.toml
//!   (in ~/src/accredit) cargo build-sbf --manifest-path programs/transfer-hook/Cargo.toml

use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;
use spl_associated_token_account_interface::{
    address::get_associated_token_address_with_program_id,
    instruction::create_associated_token_account,
};
use spl_token_2022_interface::ID as TOKEN_2022;

const STABLECOIN: Pubkey = Pubkey::from_str_const("HdaUf9PL9ncd1AgXbA13P9ss6mLtCVdGZfroZB4q6CwP");
const HOOK: Pubkey = Pubkey::from_str_const("5DLH2UrDD5bJFadn1gV1rof6sJ7MzJbVNnUfVMtGJgSL");
const SYSTEM: Pubkey = Pubkey::from_str_const("11111111111111111111111111111111");
const UPGRADEABLE_LOADER: Pubkey =
    Pubkey::from_str_const("BPFLoaderUpgradeab1e11111111111111111111111");

// Accredit TransferHookError codes.
const HOOK_SENDER_BLACKLISTED: u32 = 6010;
const HOOK_RECIPIENT_BLACKLISTED: u32 = 6011;

fn anchor_disc(name: &str) -> [u8; 8] {
    let h = Sha256::digest(format!("global:{name}").as_bytes());
    h[..8].try_into().unwrap()
}

fn hook_pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &HOOK).0
}

fn borsh_string(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

struct Env {
    svm: LiteSVM,
    payer: Keypair,
    mint: Pubkey,
    mint_config: Pubkey,
    registry: Pubkey,
    meta_list: Pubkey,
    treasury_wallet: Pubkey,
}

impl Env {
    fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let mut all: Vec<&Keypair> = vec![&self.payer];
        all.extend_from_slice(signers);
        let msg = Message::new(ixs, Some(&self.payer.pubkey()));
        let tx = Transaction::new(&all, msg, self.svm.latest_blockhash());
        self.svm
            .send_transaction(tx)
            .map(|_| ())
            .map_err(|e| format!("{:?} {:#?}", e.err, e.meta.logs))
    }

    fn ata(&self, wallet: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(wallet, &self.mint, &TOKEN_2022)
    }

    fn whitelist(&self, wallet: &Pubkey) -> Pubkey {
        hook_pda(&[b"whitelist", self.registry.as_ref(), wallet.as_ref()])
    }

    fn blacklist(&self, wallet: &Pubkey) -> Pubkey {
        hook_pda(&[b"blacklist", self.registry.as_ref(), wallet.as_ref()])
    }

    fn balance(&self, wallet: &Pubkey) -> u64 {
        let acc = self.svm.get_account(&self.ata(wallet)).unwrap();
        u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
    }

    /// Give `wallet` an ATA. With `balance > 0`, the balance is written into
    /// the account directly (minting needs an issuer and collateral, which
    /// is beside the point here).
    fn new_holder(&mut self, wallet: &Pubkey, balance: u64) {
        let ix = create_associated_token_account(
            &self.payer.pubkey(),
            wallet,
            &self.mint,
            &TOKEN_2022,
        );
        self.send(&[ix], &[]).unwrap();
        if balance > 0 {
            let ata = self.ata(wallet);
            let mut acc = self.svm.get_account(&ata).unwrap();
            acc.data[64..72].copy_from_slice(&balance.to_le_bytes());
            self.svm.set_account(ata, acc).unwrap();
        }
    }

    fn whitelist_ix(&self, wallet: &Pubkey) -> Instruction {
        let mut data = anchor_disc("add_to_whitelist").to_vec();
        data.extend_from_slice(wallet.as_ref());
        data.push(0); // KycLevel::Basic
        data.push(0); // Jurisdiction::Japan
        data.extend_from_slice(&[7u8; 32]);
        data.extend_from_slice(&0u64.to_le_bytes()); // daily_limit: 0 = unlimited
        data.extend_from_slice(&0i64.to_le_bytes()); // no expiry
        Instruction {
            program_id: HOOK,
            accounts: vec![
                AccountMeta::new(self.payer.pubkey(), true),
                AccountMeta::new(self.registry, false),
                AccountMeta::new(self.whitelist(wallet), false),
                AccountMeta::new_readonly(SYSTEM, false),
            ],
            data,
        }
    }

    fn blacklist_ix(&self, wallet: &Pubkey) -> Instruction {
        let mut data = anchor_disc("add_to_blacklist").to_vec();
        data.extend_from_slice(wallet.as_ref());
        borsh_string(&mut data, "sanctioned");
        Instruction {
            program_id: HOOK,
            accounts: vec![
                AccountMeta::new(self.payer.pubkey(), true),
                AccountMeta::new(self.registry, false),
                AccountMeta::new(self.blacklist(wallet), false),
                AccountMeta::new_readonly(SYSTEM, false),
            ],
            data,
        }
    }

    /// Accounts the hook's ExtraAccountMeta list resolves to.
    fn hook_extras(&self, from: &Pubkey, to: &Pubkey) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new_readonly(self.registry, false),
            AccountMeta::new(self.whitelist(from), false),
            AccountMeta::new_readonly(self.whitelist(to), false),
            AccountMeta::new_readonly(self.blacklist(from), false),
            AccountMeta::new_readonly(self.blacklist(to), false),
        ]
    }

    /// meridian `transfer`; `with_hook_accounts` false omits the remaining
    /// accounts.
    fn transfer_ix(
        &self,
        sender: &Pubkey,
        recipient: &Pubkey,
        amount: u64,
        with_hook_accounts: bool,
    ) -> Instruction {
        let mut data = anchor_disc("transfer").to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        data.push(0); // memo: None
        let mut accounts = vec![
            AccountMeta::new(*sender, true),
            AccountMeta::new_readonly(self.mint_config, false),
            AccountMeta::new_readonly(self.mint, false),
            AccountMeta::new(self.ata(sender), false),
            AccountMeta::new(self.ata(recipient), false),
            AccountMeta::new_readonly(HOOK, false),
            AccountMeta::new_readonly(self.meta_list, false),
            AccountMeta::new_readonly(TOKEN_2022, false),
        ];
        if with_hook_accounts {
            accounts.extend(self.hook_extras(sender, recipient));
        }
        Instruction { program_id: STABLECOIN, accounts, data }
    }

    /// meridian `seize` from `holder` to the treasury, with the hook's
    /// accounts (extras, hook program, meta list) as remaining accounts.
    fn seize_ix(&self, authority: &Pubkey, holder: &Pubkey, amount: u64) -> Instruction {
        let mut data = anchor_disc("seize").to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        data.extend_from_slice(&[1u8; 32]); // reason
        let mut accounts = vec![
            AccountMeta::new_readonly(*authority, true),
            AccountMeta::new(self.mint_config, false),
            AccountMeta::new_readonly(self.mint, false),
            AccountMeta::new(self.ata(holder), false),
            AccountMeta::new(self.ata(&self.treasury_wallet), false),
            AccountMeta::new_readonly(TOKEN_2022, false),
        ];
        accounts.extend(self.hook_extras(holder, &self.treasury_wallet));
        accounts.push(AccountMeta::new_readonly(HOOK, false));
        accounts.push(AccountMeta::new_readonly(self.meta_list, false));
        Instruction { program_id: STABLECOIN, accounts, data }
    }
}

/// SSS-2 mint via meridian `initialize`, Accredit registry created by the
/// hook's upgrade authority (the mint authority is the mint_config PDA),
/// meta list set up, treasury wallet whitelisted.
fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let dir = env!("CARGO_MANIFEST_DIR");
    svm.add_program_from_file(STABLECOIN, format!("{dir}/../target/deploy/meridian_stablecoin.so"))
        .expect("build meridian_stablecoin.so with cargo build-sbf first");
    let hook_so = std::env::var("ACCREDIT_TRANSFER_HOOK_SO")
        .unwrap_or_else(|_| format!("{dir}/../../accredit/target/deploy/transfer_hook.so"));
    svm.add_program_from_file(HOOK, &hook_so)
        .unwrap_or_else(|e| panic!("load Accredit transfer hook from {hook_so}: {e:?}"));

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000_000_000).unwrap();
    let payer_pk = payer.pubkey();

    // Hook ProgramData with the payer as upgrade authority (LiteSVM's
    // add_program_from_file does not create one).
    let mut pd = 3u32.to_le_bytes().to_vec();
    pd.extend_from_slice(&0u64.to_le_bytes());
    pd.push(1);
    pd.extend_from_slice(payer_pk.as_ref());
    let program_data = Pubkey::find_program_address(&[HOOK.as_ref()], &UPGRADEABLE_LOADER).0;
    let lamports = svm.minimum_balance_for_rent_exemption(pd.len());
    svm.set_account(
        program_data,
        Account { lamports, data: pd, owner: UPGRADEABLE_LOADER, executable: false, rent_epoch: 0 },
    )
    .unwrap();

    let mint_kp = Keypair::new();
    let mint = mint_kp.pubkey();
    let mint_config = Pubkey::find_program_address(&[b"mint_config"], &STABLECOIN).0;
    let treasury_wallet = Pubkey::new_unique();
    let mut env = Env {
        svm,
        payer,
        mint,
        mint_config,
        registry: hook_pda(&[b"kyc_registry", mint.as_ref()]),
        meta_list: hook_pda(&[b"extra-account-metas", mint.as_ref()]),
        treasury_wallet,
    };
    let treasury_ata = env.ata(&treasury_wallet);

    // meridian initialize (SSS-2)
    let mut data = anchor_disc("initialize").to_vec();
    data.push(1); // StablecoinPreset::Sss2
    borsh_string(&mut data, "Test JPY");
    borsh_string(&mut data, "TJPY");
    borsh_string(&mut data, "https://example.invalid");
    data.push(2); // decimals
    data.push(0); // freeze_authority: None
    data.push(0); // price_oracle: None
    data.push(1); // treasury: Some
    data.extend_from_slice(treasury_ata.as_ref());
    data.extend_from_slice(&[0, 0, 0]); // overrides: None x3
    let init = Instruction {
        program_id: STABLECOIN,
        accounts: vec![
            AccountMeta::new(payer_pk, true),
            AccountMeta::new(mint_config, false),
            AccountMeta::new(mint, true),
            AccountMeta::new_readonly(HOOK, false),
            AccountMeta::new_readonly(TOKEN_2022, false),
            AccountMeta::new_readonly(SYSTEM, false),
        ],
        data,
    };
    env.send(&[init], &[&mint_kp]).unwrap();

    // Accredit registry (signed by the hook upgrade authority) + meta list
    let mut data = anchor_disc("initialize_registry").to_vec();
    data.extend_from_slice(payer_pk.as_ref()); // admin
    let init_registry = Instruction {
        program_id: HOOK,
        accounts: vec![
            AccountMeta::new(payer_pk, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(env.registry, false),
            AccountMeta::new_readonly(program_data, false),
            AccountMeta::new_readonly(SYSTEM, false),
        ],
        data,
    };
    let init_meta = Instruction {
        program_id: HOOK,
        accounts: vec![
            AccountMeta::new(payer_pk, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(env.meta_list, false),
            AccountMeta::new_readonly(SYSTEM, false),
        ],
        data: anchor_disc("initialize_extra_account_meta_list").to_vec(),
    };
    let wl = env.whitelist_ix(&treasury_wallet);
    env.send(&[init_registry, init_meta, wl], &[]).unwrap();
    env.new_holder(&treasury_wallet, 0);
    env
}

fn assert_code(res: Result<(), String>, code: u32) {
    let err = res.expect_err("expected the transaction to fail");
    assert!(
        err.contains(&format!("Custom({code})")),
        "expected custom error {code}, got {err}"
    );
}

#[test]
fn transfer_goes_through_the_hook() {
    let mut env = setup();
    let alice = Keypair::new();
    let bob = Keypair::new();
    env.svm.airdrop(&alice.pubkey(), 1_000_000_000).unwrap();
    let (a, b) = (alice.pubkey(), bob.pubkey());
    let ixs = [env.whitelist_ix(&a), env.whitelist_ix(&b)];
    env.send(&ixs, &[]).unwrap();
    env.new_holder(&a, 10_000);
    env.new_holder(&b, 0);

    // Without the hook's accounts Token-2022 cannot run the hook.
    let ix = env.transfer_ix(&a, &b, 1_000, false);
    assert!(env.send(&[ix], &[&alice]).is_err());

    let ix = env.transfer_ix(&a, &b, 1_000, true);
    env.send(&[ix], &[&alice]).unwrap();
    assert_eq!(env.balance(&b), 1_000);

    // Once blacklisted, the holder cannot transfer.
    let ix = env.blacklist_ix(&a);
    env.send(&[ix], &[]).unwrap();
    let ix = env.transfer_ix(&a, &b, 1_000, true);
    assert_code(env.send(&[ix], &[&alice]), HOOK_SENDER_BLACKLISTED);
}

#[test]
fn seize_from_blacklisted_holder_uses_the_permanent_delegate() {
    let mut env = setup();
    let holder = Pubkey::new_unique();
    let unlisted = Pubkey::new_unique();
    let ixs = [env.whitelist_ix(&holder), env.blacklist_ix(&holder)];
    env.send(&ixs, &[]).unwrap();
    env.new_holder(&holder, 5_000);
    env.new_holder(&unlisted, 2_000);

    let payer = env.payer.pubkey();
    let ix = env.seize_ix(&payer, &holder, 0); // 0 = whole balance
    env.send(&[ix], &[]).unwrap();
    assert_eq!(env.balance(&holder), 0);
    assert_eq!(env.balance(&env.treasury_wallet.clone()), 5_000);

    // A holder with no whitelist entry can be seized from too.
    let ix = env.seize_ix(&payer, &unlisted, 500);
    env.send(&[ix], &[]).unwrap();
    assert_eq!(env.balance(&unlisted), 1_500);
}

#[test]
fn seize_still_requires_an_allowed_treasury() {
    let mut env = setup();
    let holder = Pubkey::new_unique();
    let ix = env.whitelist_ix(&holder);
    env.send(&[ix], &[]).unwrap();
    env.new_holder(&holder, 5_000);
    let treasury = env.treasury_wallet;
    let ix = env.blacklist_ix(&treasury);
    env.send(&[ix], &[]).unwrap();

    let payer = env.payer.pubkey();
    let ix = env.seize_ix(&payer, &holder, 1);
    assert_code(env.send(&[ix], &[]), HOOK_RECIPIENT_BLACKLISTED);
}

#[test]
fn seize_by_someone_else_fails() {
    let mut env = setup();
    let holder = Pubkey::new_unique();
    let ixs = [env.whitelist_ix(&holder), env.blacklist_ix(&holder)];
    env.send(&ixs, &[]).unwrap();
    env.new_holder(&holder, 5_000);

    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let ix = env.seize_ix(&mallory.pubkey(), &holder, 1);
    assert!(env.send(&[ix], &[&mallory]).is_err());
    assert_eq!(env.balance(&holder), 5_000);
}
