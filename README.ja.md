# Meridian

**トークン化証券・RWA取引のための日本円ステーブルコインインフラ**

Meridian HoldingsとNova Labsのパートナーシップによる、アジアのオンチェーン資本市場向けレイヤー1ブロックチェーンプラットフォーム。

## 概要

Meridianは機関投資家向けのインフラストラクチャを提供します：
- **日本円ステーブルコイン**: 信託型3号電子決済手段に準拠
- **証券取引**: トークン化株式の24時間365日スポット・デリバティブ市場
- **RWAトークン化**: 実物資産の登録、保管検証、配当管理
- **コンプライアンス**: Token-2022トランスファーフックによるKYC/AML機能内蔵

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MERIDIANプラットフォーム                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │   JPY発行      │  │  コンプライアンス │  │    取引        │        │
│  │   エンジン      │  │    レイヤー      │  │   エンジン      │        │
│  │                │  │                │  │                │        │
│  │  meridian-jpy  │  │  transfer-hook │  │  securities-   │        │
│  │                │  │                │  │  engine        │        │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │
│          │                   │                   │                  │
│  ┌───────┴────────┐  ┌───────┴────────┐  ┌───────┴────────┐        │
│  │  RWAレジストリ  │  │   オラクル      │  │      SDK       │        │
│  │                │  │                │  │                │        │
│  │  rwa-registry  │  │     oracle     │  │  @meridian/sdk │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│                                                                     │
│                    ┌─────────────────────┐                         │
│                    │    APIゲートウェイ    │                         │
│                    │    Next.js + API    │                         │
│                    └─────────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## クロスブリーディング元

本プロジェクトは既存リポジトリのパターンを統合しています：

| コンポーネント | 元リポジトリ | 主要パターン |
|--------------|-------------|-------------|
| 日本円ステーブルコイン | `continuum` | Token-2022発行、トランスファーフック、担保管理 |
| トランスファーフック | `continuum`, `sovereign` | KYCホワイトリスト、管轄権チェック、日次制限 |
| 証券エンジン | `indie-star-market`, `simple-dex` | AMM (x*y=k)、LPトークン、プール管理 |
| デリバティブ | `sigma` | パーペチュアル、ファンディングレート、バリアンススワップ |
| オラクル | `sigma` | TWAP、ボラティリティインデックス、ファンディングフィード |
| RWAレジストリ | `titanus`, `mon-solana` | 資産登録、所有権証明、配当 |
| APIレイヤー | `kalshify` | Next.jsパターン、Prismaスキーマ、認証 |

## プログラム

### meridian-jpy
Token-2022拡張機能を備えたコア日本円ステーブルコイン：
- 担保検証付き発行/償還
- マルチ発行者対応（信託銀行、ディストリビューター）
- 緊急停止メカニズム
- コンプライアンス用監査証跡

### transfer-hook
トランスファーフックによるKYC/AML強制：
- ホワイトリストベースの送金
- 管轄権制限（米国はブロック）
- 日次制限の強制
- 有効期限管理

### securities-engine
24時間365日取引インフラ：
- スポット取引用AMMプール
- ファンディング付きパーペチュアル先物
- バリアンススワップ、ファンディングレートスワップ
- 指値注文用オーダーブック

### oracle
価格フィードインフラ：
- リアルタイム価格更新
- TWAP計算
- ボラティリティレジーム検出
- マルチソースファンディングレート

### rwa-registry
実物資産トークン化：
- 保管付き資産登録
- 所有権証明管理
- 配当分配
- コンプライアンス用凍結/解除

## 始め方

### 前提条件
- Rust 1.75以上
- Solana CLI 2.2以上
- Anchor 0.32以上
- Node.js 20以上
- PostgreSQL 15以上

### インストール

```bash
# リポジトリをクローン
cd /Users/hiroyusai/src/meridian

# 依存関係をインストール
yarn install

# Anchorプログラムをビルド
anchor build

# Prismaクライアントを生成
yarn db:generate

# テストを実行
anchor test
```

### 開発

```bash
# ローカルバリデータを起動
solana-test-validator

# プログラムをデプロイ
anchor deploy

# Next.js開発サーバーを起動
yarn dev
```

## APIエンドポイント

### 日本円ステーブルコイン
```
POST /api/v1/jpy/mint/request     # JPY発行リクエスト
GET  /api/v1/jpy/mint/status/:id  # 発行ステータス確認
POST /api/v1/jpy/burn             # 償還のための焼却
```

### コンプライアンス
```
POST /api/v1/jpy/compliance/kyc/submit  # KYC提出
GET  /api/v1/jpy/compliance?wallet=...  # ステータス確認
```

### 取引
```
GET  /api/v1/swap/quote    # スワップ見積もり取得
POST /api/v1/swap/execute  # スワップ実行
```

### 証券
```
GET  /api/v1/securities/markets         # マーケット一覧
GET  /api/v1/securities/markets/:symbol # マーケット詳細
POST /api/v1/securities/positions       # ポジションオープン
```

### RWA
```
GET  /api/v1/rwa/assets          # RWA資産一覧
GET  /api/v1/rwa/assets/:symbol  # 資産詳細
GET  /api/v1/rwa/dividends       # 未受領配当
```

## SDK使用方法

```typescript
import { createMeridianClient, createJpySdk, createSecuritiesSdk } from '@meridian/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// クライアントを初期化
const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = createMeridianClient({ connection });

// JPY操作
const jpySdk = createJpySdk(client);
const balance = await jpySdk.getBalance(walletPubkey, jpyMint);
console.log(jpySdk.formatAmount(balance)); // ¥1,234.56

// 証券取引
const secSdk = createSecuritiesSdk(client);
const quote = await secSdk.getSwapQuote(marketPubkey, inputAmount, true);
console.log(`出力: ${quote.outputAmount}, 価格影響: ${quote.priceImpact}%`);
```

## 規制コンプライアンス

### 資金決済法（PSA）
- 信託型3号電子決済手段
- 国内送金に100万円制限なし
- 100%法定通貨担保
- 定期監査要件

### KYC/AML
- トランスファーフックによる全送金検証
- 管轄権ベースの制限
- 多段階KYC検証
- 有効期限・更新管理

## パートナー

| パートナー | 役割 |
|----------|------|
| **Meridian Holdings** | 規制コンプライアンス、販売 |
| **Nova Labs** | スマートコントラクト、API設計、セキュリティシステム |
| **Meridian Trust Bank** | ステーブルコイン発行・償還 |
| **Meridian Trading** | 電子決済手段取扱業者としての販売 |

## ライセンス

プロプライエタリ - Meridian Holdings × Nova Labs

---

*Strium Network向けに構築 - トークン化証券のためのアジアの取引所レイヤーインフラ*
