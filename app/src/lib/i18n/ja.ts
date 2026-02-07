/**
 * Japanese (日本語) translations for Meridian
 */

export const ja = {
  // Common
  common: {
    appName: 'Meridian',
    tagline: 'トークン化証券・RWA取引のための日本円ステーブルコインインフラ',
    loading: '読み込み中...',
    error: 'エラー',
    success: '成功',
    cancel: 'キャンセル',
    confirm: '確認',
    submit: '送信',
    save: '保存',
    delete: '削除',
    edit: '編集',
    close: '閉じる',
    back: '戻る',
    next: '次へ',
    done: '完了',
    search: '検索',
    filter: 'フィルター',
    sort: '並び替え',
    refresh: '更新',
    copy: 'コピー',
    copied: 'コピーしました',
    viewAll: 'すべて表示',
    learnMore: '詳細を見る',
    connectWallet: 'ウォレットを接続',
    disconnectWallet: 'ウォレットを切断',
    walletConnected: 'ウォレット接続済み',
    noData: 'データがありません',
    comingSoon: '近日公開',
  },

  // Navigation
  nav: {
    home: 'ホーム',
    dashboard: 'ダッシュボード',
    mint: '発行',
    burn: '償還',
    transfer: '送金',
    swap: 'スワップ',
    trade: '取引',
    markets: 'マーケット',
    portfolio: 'ポートフォリオ',
    compliance: 'コンプライアンス',
    settings: '設定',
    help: 'ヘルプ',
    docs: 'ドキュメント',
  },

  // JPY Stablecoin
  jpy: {
    title: '日本円ステーブルコイン',
    symbol: 'JPY',
    balance: '残高',
    totalSupply: '総供給量',
    collateralRatio: '担保率',

    // Mint
    mint: {
      title: 'JPY発行',
      description: '法定通貨を預け入れてJPYトークンを発行',
      amount: '発行金額',
      amountPlaceholder: '金額を入力',
      recipient: '受取アドレス',
      recipientPlaceholder: 'Solanaアドレスを入力',
      reference: '銀行振込参照番号',
      referencePlaceholder: '振込参照番号を入力',
      jurisdiction: '管轄地域',
      submit: '発行リクエスト',
      processing: '処理中...',
      success: '発行リクエストが送信されました',
      estimatedTime: '予想完了時間',
      status: {
        pending: '保留中',
        processing: '処理中',
        completed: '完了',
        failed: '失敗',
        cancelled: 'キャンセル済み',
      },
    },

    // Burn
    burn: {
      title: 'JPY償還',
      description: 'JPYトークンを焼却して法定通貨を引き出し',
      amount: '償還金額',
      amountPlaceholder: '金額を入力',
      bankAccount: '銀行口座情報',
      bankAccountPlaceholder: '口座情報を入力',
      submit: '償還リクエスト',
      processing: '処理中...',
      success: '償還リクエストが送信されました',
      availableBalance: '利用可能残高',
    },

    // Transfer
    transfer: {
      title: 'JPY送金',
      description: 'KYC認証済みアドレスにJPYを送金',
      amount: '送金金額',
      recipient: '送金先アドレス',
      recipientPlaceholder: '送金先のSolanaアドレス',
      memo: 'メモ（任意）',
      memoPlaceholder: 'メモを入力',
      submit: '送金',
      processing: '送金中...',
      success: '送金が完了しました',
      noLimit: '100万円制限なし（信託型電子決済手段）',
    },
  },

  // Compliance / KYC
  compliance: {
    title: 'コンプライアンス',
    kyc: {
      title: 'KYC認証',
      description: '本人確認を完了してJPYの送受信を有効化',
      status: 'KYCステータス',
      level: 'KYCレベル',
      jurisdiction: '管轄地域',
      expiresAt: '有効期限',
      submit: 'KYC書類を提出',
      refresh: 'KYCを更新',

      levels: {
        basic: 'ベーシック',
        standard: 'スタンダード',
        enhanced: 'エンハンスド',
        institutional: '機関投資家',
      },

      statuses: {
        pending: '審査待ち',
        inReview: '審査中',
        verified: '認証済み',
        rejected: '却下',
        expired: '期限切れ',
      },
    },

    whitelist: {
      title: 'ホワイトリスト',
      status: 'ホワイトリストステータス',
      isWhitelisted: 'ホワイトリスト登録済み',
      notWhitelisted: '未登録',
      dailyLimit: '日次制限',
      dailyUsed: '本日の利用額',
      unlimited: '無制限',
    },

    jurisdictions: {
      JP: '日本',
      SG: 'シンガポール',
      HK: '香港',
      EU: 'EU',
      US: 'アメリカ（制限あり）',
      OTHER: 'その他',
    },
  },

  // Trading
  trading: {
    title: '取引',

    // Markets
    markets: {
      title: 'マーケット',
      allMarkets: 'すべてのマーケット',
      equity: '株式',
      rwa: 'RWA',
      perpetual: 'パーペチュアル',
      derivatives: 'デリバティブ',

      columns: {
        symbol: 'シンボル',
        name: '銘柄名',
        price: '価格',
        change24h: '24時間変動',
        volume24h: '24時間出来高',
        liquidity: '流動性',
        action: 'アクション',
      },
    },

    // Swap
    swap: {
      title: 'スワップ',
      description: 'AMMプールでトークンを交換',
      from: '支払い',
      to: '受取り',
      balance: '残高',
      max: '最大',
      half: '半分',
      inputAmount: '支払い金額',
      outputAmount: '受取り金額',
      rate: 'レート',
      priceImpact: '価格影響',
      fee: '手数料',
      slippage: 'スリッページ許容',
      route: 'ルート',
      submit: 'スワップ',
      confirm: 'スワップを確認',
      processing: 'スワップ中...',
      success: 'スワップが完了しました',

      errors: {
        insufficientBalance: '残高不足',
        slippageExceeded: 'スリッページ超過',
        insufficientLiquidity: '流動性不足',
      },
    },

    // Liquidity
    liquidity: {
      title: '流動性',
      addLiquidity: '流動性を追加',
      removeLiquidity: '流動性を削除',
      yourPositions: 'あなたのポジション',
      poolShare: 'プールシェア',
      lpTokens: 'LPトークン',
      tokenA: 'トークンA',
      tokenB: 'トークンB',
      depositAmounts: '預入金額',
      withdrawAmounts: '引出金額',
      submit: '確認',
    },

    // Positions (Derivatives)
    positions: {
      title: 'ポジション',
      openPositions: 'オープンポジション',
      closedPositions: 'クローズ済みポジション',

      columns: {
        market: 'マーケット',
        side: 'サイド',
        size: 'サイズ',
        entryPrice: '参入価格',
        markPrice: '現在価格',
        pnl: '損益',
        leverage: 'レバレッジ',
        liquidationPrice: '清算価格',
        action: 'アクション',
      },

      sides: {
        long: 'ロング',
        short: 'ショート',
      },

      actions: {
        close: 'クローズ',
        addCollateral: '担保追加',
        reduceSize: 'サイズ縮小',
      },
    },

    // Order Book
    orderBook: {
      title: 'オーダーブック',
      bids: '買い注文',
      asks: '売り注文',
      price: '価格',
      size: '数量',
      total: '合計',
      spread: 'スプレッド',
    },

    // Orders
    orders: {
      title: '注文',
      openOrders: 'オープン注文',
      orderHistory: '注文履歴',

      types: {
        market: '成行',
        limit: '指値',
        stopMarket: '逆指値（成行）',
        stopLimit: '逆指値（指値）',
        takeProfit: '利確',
      },

      statuses: {
        open: 'オープン',
        partiallyFilled: '一部約定',
        filled: '約定済み',
        cancelled: 'キャンセル済み',
        expired: '期限切れ',
      },
    },
  },

  // RWA (Real World Assets)
  rwa: {
    title: '実物資産（RWA）',
    description: 'トークン化された実物資産への投資',

    assets: {
      title: 'RWA資産',

      types: {
        equity: '株式',
        bond: '債券',
        realEstate: '不動産',
        commodity: 'コモディティ',
        equipment: '設備',
        ip: '知的財産',
        fund: 'ファンド',
      },

      columns: {
        symbol: 'シンボル',
        name: '銘柄名',
        type: '種類',
        valuation: '評価額',
        yield: '利回り',
        status: 'ステータス',
      },

      statuses: {
        pending: '審査中',
        active: '有効',
        suspended: '一時停止',
        delisted: '上場廃止',
      },
    },

    dividends: {
      title: '配当',
      pending: '未受領配当',
      claimed: '受領済み配当',
      recordDate: '権利確定日',
      paymentDate: '支払日',
      amountPerToken: '1トークンあたり',
      totalAmount: '合計金額',
      claim: '配当を請求',

      statuses: {
        announced: '発表済み',
        payable: '支払い可能',
        completed: '完了',
        cancelled: 'キャンセル',
      },
    },

    ownership: {
      title: '所有権証明',
      asset: '資産',
      amount: '保有数量',
      acquisitionPrice: '取得価格',
      currentValue: '現在価値',
      unrealizedPnl: '含み損益',
    },
  },

  // Portfolio
  portfolio: {
    title: 'ポートフォリオ',
    overview: '概要',

    summary: {
      totalValue: '総資産額',
      totalCost: '総投資額',
      totalPnl: '総損益',
      todayPnl: '本日の損益',
    },

    holdings: {
      title: '保有資産',
      asset: '資産',
      amount: '数量',
      value: '評価額',
      costBasis: '取得原価',
      pnl: '損益',
      allocation: '配分',
    },

    transactions: {
      title: '取引履歴',

      types: {
        mint: '発行',
        burn: '償還',
        transfer: '送金',
        swap: 'スワップ',
        addLiquidity: '流動性追加',
        removeLiquidity: '流動性削除',
        openPosition: 'ポジションオープン',
        closePosition: 'ポジションクローズ',
        dividendClaim: '配当請求',
      },

      columns: {
        type: '種類',
        amount: '金額',
        token: 'トークン',
        status: 'ステータス',
        timestamp: '日時',
        signature: 'シグネチャ',
      },
    },
  },

  // Settings
  settings: {
    title: '設定',

    general: {
      title: '一般',
      language: '言語',
      theme: 'テーマ',
      themes: {
        light: 'ライト',
        dark: 'ダーク',
        system: 'システム',
      },
      currency: '表示通貨',
    },

    notifications: {
      title: '通知',
      email: 'メール通知',
      push: 'プッシュ通知',
      trading: '取引通知',
      compliance: 'コンプライアンス通知',
      dividends: '配当通知',
    },

    security: {
      title: 'セキュリティ',
      twoFactor: '二要素認証',
      sessions: 'アクティブセッション',
      apiKeys: 'APIキー',
    },
  },

  // Errors
  errors: {
    generic: 'エラーが発生しました。もう一度お試しください。',
    networkError: 'ネットワークエラー。接続を確認してください。',
    walletNotConnected: 'ウォレットが接続されていません。',
    insufficientBalance: '残高が不足しています。',
    transactionFailed: 'トランザクションが失敗しました。',
    kycRequired: 'KYC認証が必要です。',
    kycExpired: 'KYC認証の有効期限が切れています。',
    jurisdictionRestricted: 'お住まいの地域ではご利用いただけません。',
    dailyLimitExceeded: '日次制限を超過しています。',
    slippageExceeded: 'スリッページ許容範囲を超えています。',
    insufficientLiquidity: '流動性が不足しています。',
    invalidAmount: '無効な金額です。',
    invalidAddress: '無効なアドレスです。',
    unauthorized: '認証が必要です。',
    forbidden: 'アクセスが拒否されました。',
    notFound: '見つかりませんでした。',
    serverError: 'サーバーエラーが発生しました。',
  },

  // Success messages
  success: {
    transactionSubmitted: 'トランザクションが送信されました。',
    transactionConfirmed: 'トランザクションが確認されました。',
    settingsSaved: '設定が保存されました。',
    copied: 'クリップボードにコピーしました。',
  },

  // Confirmations
  confirmations: {
    areYouSure: '本当によろしいですか？',
    cannotUndo: 'この操作は取り消せません。',
    confirmTransaction: 'トランザクションを確認してください。',
  },

  // Time
  time: {
    justNow: 'たった今',
    minutesAgo: '{{count}}分前',
    hoursAgo: '{{count}}時間前',
    daysAgo: '{{count}}日前',
    weeksAgo: '{{count}}週間前',
    monthsAgo: '{{count}}ヶ月前',
  },

  // Footer
  footer: {
    copyright: '© 2026 Meridian. All rights reserved.',
    poweredBy: '',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    contact: 'お問い合わせ',
  },
} as const;

export type TranslationKeys = typeof ja;
