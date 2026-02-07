/**
 * English translations for Meridian
 */

export const en = {
  // Common
  common: {
    appName: 'Meridian',
    tagline: 'JPY Stablecoin Infrastructure for Tokenized Securities and RWA Trading',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    confirm: 'Confirm',
    submit: 'Submit',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    refresh: 'Refresh',
    copy: 'Copy',
    copied: 'Copied',
    viewAll: 'View All',
    learnMore: 'Learn More',
    connectWallet: 'Connect Wallet',
    disconnectWallet: 'Disconnect Wallet',
    walletConnected: 'Wallet Connected',
    noData: 'No data available',
    comingSoon: 'Coming Soon',
  },

  // Navigation
  nav: {
    home: 'Home',
    dashboard: 'Dashboard',
    mint: 'Mint',
    burn: 'Burn',
    transfer: 'Transfer',
    swap: 'Swap',
    trade: 'Trade',
    markets: 'Markets',
    portfolio: 'Portfolio',
    compliance: 'Compliance',
    settings: 'Settings',
    help: 'Help',
    docs: 'Docs',
  },

  // JPY Stablecoin
  jpy: {
    title: 'JPY Stablecoin',
    symbol: 'JPY',
    balance: 'Balance',
    totalSupply: 'Total Supply',
    collateralRatio: 'Collateral Ratio',

    // Mint
    mint: {
      title: 'Mint JPY',
      description: 'Deposit fiat currency to mint JPY tokens',
      amount: 'Mint Amount',
      amountPlaceholder: 'Enter amount',
      recipient: 'Recipient Address',
      recipientPlaceholder: 'Enter Solana address',
      reference: 'Bank Transfer Reference',
      referencePlaceholder: 'Enter transfer reference',
      jurisdiction: 'Jurisdiction',
      submit: 'Request Mint',
      processing: 'Processing...',
      success: 'Mint request submitted',
      estimatedTime: 'Estimated completion time',
      status: {
        pending: 'Pending',
        processing: 'Processing',
        completed: 'Completed',
        failed: 'Failed',
        cancelled: 'Cancelled',
      },
    },

    // Burn
    burn: {
      title: 'Burn JPY',
      description: 'Burn JPY tokens to withdraw fiat currency',
      amount: 'Burn Amount',
      amountPlaceholder: 'Enter amount',
      bankAccount: 'Bank Account Info',
      bankAccountPlaceholder: 'Enter account info',
      submit: 'Request Burn',
      processing: 'Processing...',
      success: 'Burn request submitted',
      availableBalance: 'Available Balance',
    },

    // Transfer
    transfer: {
      title: 'Transfer JPY',
      description: 'Send JPY to KYC-verified addresses',
      amount: 'Transfer Amount',
      recipient: 'Recipient Address',
      recipientPlaceholder: 'Recipient Solana address',
      memo: 'Memo (optional)',
      memoPlaceholder: 'Enter memo',
      submit: 'Transfer',
      processing: 'Transferring...',
      success: 'Transfer completed',
      noLimit: 'No ¥1M limit (Trust-type electronic payment)',
    },
  },

  // Compliance / KYC
  compliance: {
    title: 'Compliance',
    kyc: {
      title: 'KYC Verification',
      description: 'Complete identity verification to enable JPY transfers',
      status: 'KYC Status',
      level: 'KYC Level',
      jurisdiction: 'Jurisdiction',
      expiresAt: 'Expires At',
      submit: 'Submit KYC Documents',
      refresh: 'Refresh KYC',

      levels: {
        basic: 'Basic',
        standard: 'Standard',
        enhanced: 'Enhanced',
        institutional: 'Institutional',
      },

      statuses: {
        pending: 'Pending Review',
        inReview: 'In Review',
        verified: 'Verified',
        rejected: 'Rejected',
        expired: 'Expired',
      },
    },

    whitelist: {
      title: 'Whitelist',
      status: 'Whitelist Status',
      isWhitelisted: 'Whitelisted',
      notWhitelisted: 'Not Whitelisted',
      dailyLimit: 'Daily Limit',
      dailyUsed: 'Used Today',
      unlimited: 'Unlimited',
    },

    jurisdictions: {
      JP: 'Japan',
      SG: 'Singapore',
      HK: 'Hong Kong',
      EU: 'EU',
      US: 'USA (Restricted)',
      OTHER: 'Other',
    },
  },

  // Trading
  trading: {
    title: 'Trading',

    // Markets
    markets: {
      title: 'Markets',
      allMarkets: 'All Markets',
      equity: 'Equity',
      rwa: 'RWA',
      perpetual: 'Perpetual',
      derivatives: 'Derivatives',

      columns: {
        symbol: 'Symbol',
        name: 'Name',
        price: 'Price',
        change24h: '24h Change',
        volume24h: '24h Volume',
        liquidity: 'Liquidity',
        action: 'Action',
      },
    },

    // Swap
    swap: {
      title: 'Swap',
      description: 'Exchange tokens on AMM pools',
      from: 'From',
      to: 'To',
      balance: 'Balance',
      max: 'Max',
      half: 'Half',
      inputAmount: 'Input Amount',
      outputAmount: 'Output Amount',
      rate: 'Rate',
      priceImpact: 'Price Impact',
      fee: 'Fee',
      slippage: 'Slippage Tolerance',
      route: 'Route',
      submit: 'Swap',
      confirm: 'Confirm Swap',
      processing: 'Swapping...',
      success: 'Swap completed',

      errors: {
        insufficientBalance: 'Insufficient balance',
        slippageExceeded: 'Slippage exceeded',
        insufficientLiquidity: 'Insufficient liquidity',
      },
    },

    // Liquidity
    liquidity: {
      title: 'Liquidity',
      addLiquidity: 'Add Liquidity',
      removeLiquidity: 'Remove Liquidity',
      yourPositions: 'Your Positions',
      poolShare: 'Pool Share',
      lpTokens: 'LP Tokens',
      tokenA: 'Token A',
      tokenB: 'Token B',
      depositAmounts: 'Deposit Amounts',
      withdrawAmounts: 'Withdraw Amounts',
      submit: 'Confirm',
    },

    // Positions (Derivatives)
    positions: {
      title: 'Positions',
      openPositions: 'Open Positions',
      closedPositions: 'Closed Positions',

      columns: {
        market: 'Market',
        side: 'Side',
        size: 'Size',
        entryPrice: 'Entry Price',
        markPrice: 'Mark Price',
        pnl: 'PnL',
        leverage: 'Leverage',
        liquidationPrice: 'Liq. Price',
        action: 'Action',
      },

      sides: {
        long: 'Long',
        short: 'Short',
      },

      actions: {
        close: 'Close',
        addCollateral: 'Add Collateral',
        reduceSize: 'Reduce Size',
      },
    },

    // Order Book
    orderBook: {
      title: 'Order Book',
      bids: 'Bids',
      asks: 'Asks',
      price: 'Price',
      size: 'Size',
      total: 'Total',
      spread: 'Spread',
    },

    // Orders
    orders: {
      title: 'Orders',
      openOrders: 'Open Orders',
      orderHistory: 'Order History',

      types: {
        market: 'Market',
        limit: 'Limit',
        stopMarket: 'Stop Market',
        stopLimit: 'Stop Limit',
        takeProfit: 'Take Profit',
      },

      statuses: {
        open: 'Open',
        partiallyFilled: 'Partially Filled',
        filled: 'Filled',
        cancelled: 'Cancelled',
        expired: 'Expired',
      },
    },
  },

  // RWA (Real World Assets)
  rwa: {
    title: 'Real World Assets (RWA)',
    description: 'Invest in tokenized real-world assets',

    assets: {
      title: 'RWA Assets',

      types: {
        equity: 'Equity',
        bond: 'Bond',
        realEstate: 'Real Estate',
        commodity: 'Commodity',
        equipment: 'Equipment',
        ip: 'Intellectual Property',
        fund: 'Fund',
      },

      columns: {
        symbol: 'Symbol',
        name: 'Name',
        type: 'Type',
        valuation: 'Valuation',
        yield: 'Yield',
        status: 'Status',
      },

      statuses: {
        pending: 'Pending',
        active: 'Active',
        suspended: 'Suspended',
        delisted: 'Delisted',
      },
    },

    dividends: {
      title: 'Dividends',
      pending: 'Pending Dividends',
      claimed: 'Claimed Dividends',
      recordDate: 'Record Date',
      paymentDate: 'Payment Date',
      amountPerToken: 'Per Token',
      totalAmount: 'Total Amount',
      claim: 'Claim Dividend',

      statuses: {
        announced: 'Announced',
        payable: 'Payable',
        completed: 'Completed',
        cancelled: 'Cancelled',
      },
    },

    ownership: {
      title: 'Ownership Proof',
      asset: 'Asset',
      amount: 'Amount Held',
      acquisitionPrice: 'Acquisition Price',
      currentValue: 'Current Value',
      unrealizedPnl: 'Unrealized PnL',
    },
  },

  // Portfolio
  portfolio: {
    title: 'Portfolio',
    overview: 'Overview',

    summary: {
      totalValue: 'Total Value',
      totalCost: 'Total Cost',
      totalPnl: 'Total PnL',
      todayPnl: "Today's PnL",
    },

    holdings: {
      title: 'Holdings',
      asset: 'Asset',
      amount: 'Amount',
      value: 'Value',
      costBasis: 'Cost Basis',
      pnl: 'PnL',
      allocation: 'Allocation',
    },

    transactions: {
      title: 'Transaction History',

      types: {
        mint: 'Mint',
        burn: 'Burn',
        transfer: 'Transfer',
        swap: 'Swap',
        addLiquidity: 'Add Liquidity',
        removeLiquidity: 'Remove Liquidity',
        openPosition: 'Open Position',
        closePosition: 'Close Position',
        dividendClaim: 'Dividend Claim',
      },

      columns: {
        type: 'Type',
        amount: 'Amount',
        token: 'Token',
        status: 'Status',
        timestamp: 'Time',
        signature: 'Signature',
      },
    },
  },

  // Settings
  settings: {
    title: 'Settings',

    general: {
      title: 'General',
      language: 'Language',
      theme: 'Theme',
      themes: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      currency: 'Display Currency',
    },

    notifications: {
      title: 'Notifications',
      email: 'Email Notifications',
      push: 'Push Notifications',
      trading: 'Trading Notifications',
      compliance: 'Compliance Notifications',
      dividends: 'Dividend Notifications',
    },

    security: {
      title: 'Security',
      twoFactor: 'Two-Factor Authentication',
      sessions: 'Active Sessions',
      apiKeys: 'API Keys',
    },
  },

  // Errors
  errors: {
    generic: 'An error occurred. Please try again.',
    networkError: 'Network error. Please check your connection.',
    walletNotConnected: 'Wallet is not connected.',
    insufficientBalance: 'Insufficient balance.',
    transactionFailed: 'Transaction failed.',
    kycRequired: 'KYC verification is required.',
    kycExpired: 'KYC verification has expired.',
    jurisdictionRestricted: 'This service is not available in your region.',
    dailyLimitExceeded: 'Daily limit exceeded.',
    slippageExceeded: 'Slippage tolerance exceeded.',
    insufficientLiquidity: 'Insufficient liquidity.',
    invalidAmount: 'Invalid amount.',
    invalidAddress: 'Invalid address.',
    unauthorized: 'Authentication required.',
    forbidden: 'Access denied.',
    notFound: 'Not found.',
    serverError: 'Server error occurred.',
  },

  // Success messages
  success: {
    transactionSubmitted: 'Transaction submitted.',
    transactionConfirmed: 'Transaction confirmed.',
    settingsSaved: 'Settings saved.',
    copied: 'Copied to clipboard.',
  },

  // Confirmations
  confirmations: {
    areYouSure: 'Are you sure?',
    cannotUndo: 'This action cannot be undone.',
    confirmTransaction: 'Please confirm the transaction.',
  },

  // Time
  time: {
    justNow: 'Just now',
    minutesAgo: '{{count}} minutes ago',
    hoursAgo: '{{count}} hours ago',
    daysAgo: '{{count}} days ago',
    weeksAgo: '{{count}} weeks ago',
    monthsAgo: '{{count}} months ago',
  },

  // Footer
  footer: {
    copyright: '© 2026 Meridian. All rights reserved.',
    poweredBy: 'Meridian Holdings × Nova Labs',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    contact: 'Contact',
  },
} as const;

export type TranslationKeys = typeof en;
