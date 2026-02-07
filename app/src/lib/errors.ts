/**
 * API Error Messages - Bilingual (Japanese / English)
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'MISSING_PARAMETER'
  | 'INVALID_AMOUNT'
  | 'INVALID_ADDRESS'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_COLLATERAL'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'SLIPPAGE_EXCEEDED'
  | 'KYC_REQUIRED'
  | 'KYC_EXPIRED'
  | 'KYC_REJECTED'
  | 'JURISDICTION_RESTRICTED'
  | 'WHITELIST_REQUIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'MINT_PAUSED'
  | 'MARKET_NOT_ACTIVE'
  | 'POSITION_NOT_FOUND'
  | 'ORDER_EXPIRED'
  | 'TRANSACTION_FAILED'
  | 'INTERNAL_ERROR';

interface ErrorMessage {
  ja: string;
  en: string;
}

export const errorMessages: Record<ErrorCode, ErrorMessage> = {
  VALIDATION_ERROR: {
    ja: '入力データが無効です',
    en: 'Invalid input data',
  },
  MISSING_PARAMETER: {
    ja: '必須パラメータが不足しています',
    en: 'Required parameter is missing',
  },
  INVALID_AMOUNT: {
    ja: '無効な金額です',
    en: 'Invalid amount',
  },
  INVALID_ADDRESS: {
    ja: '無効なアドレスです',
    en: 'Invalid address',
  },
  INSUFFICIENT_BALANCE: {
    ja: '残高が不足しています',
    en: 'Insufficient balance',
  },
  INSUFFICIENT_COLLATERAL: {
    ja: '担保が不足しています',
    en: 'Insufficient collateral',
  },
  INSUFFICIENT_LIQUIDITY: {
    ja: '流動性が不足しています',
    en: 'Insufficient liquidity',
  },
  DAILY_LIMIT_EXCEEDED: {
    ja: '日次制限を超過しています',
    en: 'Daily limit exceeded',
  },
  SLIPPAGE_EXCEEDED: {
    ja: 'スリッページ許容範囲を超えています',
    en: 'Slippage tolerance exceeded',
  },
  KYC_REQUIRED: {
    ja: 'KYC認証が必要です',
    en: 'KYC verification is required',
  },
  KYC_EXPIRED: {
    ja: 'KYC認証の有効期限が切れています',
    en: 'KYC verification has expired',
  },
  KYC_REJECTED: {
    ja: 'KYC認証が却下されました',
    en: 'KYC verification was rejected',
  },
  JURISDICTION_RESTRICTED: {
    ja: 'お住まいの地域ではご利用いただけません',
    en: 'This service is not available in your region',
  },
  WHITELIST_REQUIRED: {
    ja: 'ホワイトリスト登録が必要です',
    en: 'Whitelist registration is required',
  },
  UNAUTHORIZED: {
    ja: '認証が必要です',
    en: 'Authentication required',
  },
  FORBIDDEN: {
    ja: 'アクセスが拒否されました',
    en: 'Access denied',
  },
  NOT_FOUND: {
    ja: '見つかりませんでした',
    en: 'Not found',
  },
  MINT_PAUSED: {
    ja: '発行が一時停止されています',
    en: 'Minting is currently paused',
  },
  MARKET_NOT_ACTIVE: {
    ja: 'マーケットが現在取引停止中です',
    en: 'Market is not currently active',
  },
  POSITION_NOT_FOUND: {
    ja: 'ポジションが見つかりません',
    en: 'Position not found',
  },
  ORDER_EXPIRED: {
    ja: '注文の有効期限が切れています',
    en: 'Order has expired',
  },
  TRANSACTION_FAILED: {
    ja: 'トランザクションが失敗しました',
    en: 'Transaction failed',
  },
  INTERNAL_ERROR: {
    ja: 'サーバーエラーが発生しました',
    en: 'An internal error occurred',
  },
};

/**
 * Get error message for a specific locale
 */
export function getErrorMessage(
  code: ErrorCode,
  locale: 'ja' | 'en' = 'ja'
): string {
  const messages = errorMessages[code];
  return messages ? messages[locale] : errorMessages.INTERNAL_ERROR[locale];
}

/**
 * Create an API error response
 */
export function createErrorResponse(
  code: ErrorCode,
  locale: 'ja' | 'en' = 'ja',
  details?: string
) {
  return {
    success: false,
    error: {
      code,
      message: getErrorMessage(code, locale),
      details,
    },
    timestamp: Date.now(),
  };
}

/**
 * HTTP status codes for error codes
 */
export const errorStatusCodes: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  MISSING_PARAMETER: 400,
  INVALID_AMOUNT: 400,
  INVALID_ADDRESS: 400,
  INSUFFICIENT_BALANCE: 400,
  INSUFFICIENT_COLLATERAL: 400,
  INSUFFICIENT_LIQUIDITY: 400,
  DAILY_LIMIT_EXCEEDED: 400,
  SLIPPAGE_EXCEEDED: 400,
  KYC_REQUIRED: 403,
  KYC_EXPIRED: 403,
  KYC_REJECTED: 403,
  JURISDICTION_RESTRICTED: 403,
  WHITELIST_REQUIRED: 403,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  MINT_PAUSED: 503,
  MARKET_NOT_ACTIVE: 503,
  POSITION_NOT_FOUND: 404,
  ORDER_EXPIRED: 400,
  TRANSACTION_FAILED: 500,
  INTERNAL_ERROR: 500,
};
