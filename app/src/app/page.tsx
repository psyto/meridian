import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Meridian
            </h1>
            <p className="text-xl md:text-2xl text-primary-100 mb-4">
              ステーブルコインインフラ
            </p>
            <p className="text-lg text-primary-200 mb-8 max-w-2xl mx-auto">
              トークン化証券・RWA取引のための次世代金融インフラ
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/dashboard"
                className="bg-white text-primary-700 hover:bg-primary-50 font-medium py-3 px-8 rounded-lg transition-colors"
              >
                ダッシュボードへ
              </Link>
              <Link
                href="/dashboard/mint"
                className="bg-primary-500 hover:bg-primary-400 text-white font-medium py-3 px-8 rounded-lg transition-colors border border-primary-400"
              >
                発行
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            主要機能
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Stablecoin */}
            <div className="card">
              <div className="w-12 h-12 bg-accent-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">¥</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                ステーブルコイン
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                信託型3号電子決済手段に準拠。100万円制限なしで国内送金が可能。
              </p>
            </div>

            {/* Securities Trading */}
            <div className="card">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                24/7 証券取引
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                トークン化株式・RWAのスポット・デリバティブ市場を24時間365日提供。
              </p>
            </div>

            {/* RWA */}
            <div className="card">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                RWAトークン化
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                不動産・債券・設備などの実物資産をトークン化。配当管理も自動化。
              </p>
            </div>

            {/* Compliance */}
            <div className="card">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                コンプライアンス
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                KYC/AML機能内蔵。トランスファーフックによる送金時の自動検証。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary-600">¥0</p>
              <p className="text-sm text-gray-500 mt-1">総供給量</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary-600">100%</p>
              <p className="text-sm text-gray-500 mt-1">担保率</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary-600">0</p>
              <p className="text-sm text-gray-500 mt-1">登録ユーザー</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary-600">5</p>
              <p className="text-sm text-gray-500 mt-1">対応プログラム</p>
            </div>
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-8 text-gray-900 dark:text-white">
            パートナー
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <p className="font-semibold text-gray-900 dark:text-white">Meridian Trust Bank</p>
                <p className="text-sm text-gray-500 mt-1">発行・償還</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <p className="font-semibold text-gray-900 dark:text-white">Meridian Trading</p>
                <p className="text-sm text-gray-500 mt-1">電子決済手段取扱業者</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            今すぐ始める
          </h2>
          <p className="text-primary-100 mb-8 max-w-xl mx-auto">
            ウォレットを接続してKYC認証を完了すると、ステーブルコインの発行・送金・取引が可能になります。
          </p>
          <Link
            href="/dashboard/compliance"
            className="inline-block bg-white text-primary-700 hover:bg-primary-50 font-medium py-3 px-8 rounded-lg transition-colors"
          >
            KYC認証を開始
          </Link>
        </div>
      </section>
    </div>
  );
}
