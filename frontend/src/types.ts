export type MarketEvent = {
  id: string;
  asset: string;
  current_price: number;
  price_change_5m_pct: number;
  social_sentiment_score: number | null;
  volume_spike_multiplier: number;
  volume_24h: number;
  anomaly: boolean;
  news_headline: string;
  order_book?: { spread_pct: number; bid_depth_collapse: boolean };
  on_chain?: { whale_sell_pressure: string; exchange_inflow_usd: number };
  timestamp?: string;
};

export type WalletState = {
  USDC: number;
  BTC?: number;
  ETH?: number;
  SOL?: number;
  [key: string]: number | undefined;
};

export type Transaction = {
  tx_id: string;
  timestamp: string;
  asset: string;
  action: string;
  size: number;
  price_at_execution: number;
  summary: string;
  success: boolean;
};

export type Decision = {
  action: string;
  classification: string;
  confidence: number;
  rationale: string;
  branch: string;
  executeSize: number;
  score?: number;
  components?: Record<string, string>;
};

export type LogType =
  | 'header' | 'system' | 'observation' | 'reasoning'
  | 'decision' | 'action' | 'success' | 'error'
  | 'robustness' | 'recovery' | 'fallback' | 'retry' | 'separator'
  | 'score' | 'pump';

export type LogLine = { id: string; text: string; type: LogType };

export type Tab = 'dashboard' | 'agent' | 'analytics' | 'chat' | 'alerts';

export type PriceSnapshot = { t: number } & Record<string, number>;
