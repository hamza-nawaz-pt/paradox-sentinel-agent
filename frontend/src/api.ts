export const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE ?? 'https://paradox-sentinel-agent.onrender.com');

export const get  = (path: string) => fetch(`${API_BASE}${path}`).then(r => r.json());
export const post = (path: string, body: object) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const fetchMarketStream = () => get('/api/market-stream');
export const fetchWallet       = () => get('/api/wallet');
export const fetchTxLog        = () => get('/api/tx-log');
export const toggleChaos       = () => get('/api/toggle-chaos');
export const parseContent      = (text: string) => post('/api/parse-content', { text }).then(r => r.json());
export const sendChat          = (message: string) => post('/api/chat', { message }).then(r => r.json());
export const executeAction     = (asset: string, action: string, size: number) =>
  post('/api/execute-action', { asset, action, size });
