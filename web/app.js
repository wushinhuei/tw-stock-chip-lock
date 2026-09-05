const config = window.CHIP_LOCK_CONFIG || {};
const REVIEW_KEY = 'tw-stock-chip-lock/reviews/v1';
const NOTIFY_KEY = 'tw-stock-chip-lock/notified/v1';
let snapshot;
let reviews = loadJson(REVIEW_KEY, {});

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveReviews() { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews)); }
function formatPercent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—'; }
function formatNumber(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-TW', { maximumFractionDigits: 2 }) : '—'; }

function renderStatus() {
  const badge = document.querySelector('#statusBadge');
  badge.textContent = snapshot.dataStatus;
  badge.className = `status ${snapshot.dataStatus.toLowerCase()}`;
  document.querySelector('#statusText').textContent = snapshot.allowNewRisk
    ? '必要官方資料完整且日期一致，可進行人工複核與警示。'
    : '資料尚未完整或已過期：只可觀察，禁止新進場與加碼。';
  const sources = snapshot.manifest?.sources || {};
  document.querySelector('#sourceCards').innerHTML = Object.entries(sources).map(([name, source]) =>
    `<div><strong>${name.toUpperCase()}</strong><span>${source.provider || '—'}</span><span>日期 ${source.date || '缺漏'}</span><span>${source.rows ?? 0} 筆</span></div>`
  ).join('') || '<div>尚無來源資料</div>';
  document.querySelector('#warnings').textContent = (snapshot.manifest?.warnings || []).join('；');
}

function approvedCount(exclude) {
  return Object.entries(reviews).filter(([symbol, review]) => symbol !== exclude && review.approved).length;
}

function reviewReady(review) {
  return Number(review.neckline) > 0 && Number(review.branchConcentration20d) > 0.10
    && Boolean(review.sourceDate) && /^https?:\/\//.test(review.sourceUrl || '')
    && review.platformConfirmed && review.mopsRiskChecked
    && !review.daytradeRisk && !review.highLevelStagnation;
}

function bindReview(card, candidate) {
  const review = reviews[candidate.symbol] || { neckline: candidate.technical.prior60High };
  const fields = {
    approved: '.approved', neckline: '.neckline', branchConcentration20d: '.branch-concentration', sourceDate: '.source-date',
    sourceUrl: '.source-url', daytradeRisk: '.daytrade-risk', platformConfirmed: '.platform-confirmed', mopsRiskChecked: '.mops-checked', highLevelStagnation: '.stagnation', longUpperShadow: '.upper-shadow', blackCandle: '.black-candle', notes: '.notes'
  };
  for (const [key, selector] of Object.entries(fields)) {
    const input = card.querySelector(selector);
    input[input.type === 'checkbox' ? 'checked' : 'value'] = review[key] ?? (input.type === 'checkbox' ? false : '');
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
      const nextReview = { ...(reviews[candidate.symbol] || {}), [key]: value };
      if (key === 'approved' && value && approvedCount(candidate.symbol) >= 3) { input.checked = false; alert('口袋名單最多核准三檔。'); return; }
      if (key === 'approved' && value && !reviewReady(nextReview)) { input.checked = false; alert('核准前需完成分點集中度>10%、來源日期/網址、平台與MOPS檢查，且不得有隔日沖或高檔滯漲風險。'); return; }
      reviews[candidate.symbol] = nextReview;
      saveReviews();
    });
  }
}

function renderCandidates() {
  const list = document.querySelector('#candidateList');
  const rows = snapshot.candidates || [];
  document.querySelector('#candidateCount').textContent = `${rows.length} / 20 檔`;
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="empty">目前沒有可交易候選。請查看資料完整性與缺漏原因；系統不會降低門檻湊數。</div>'; return; }
  for (const candidate of rows) {
    const card = document.querySelector('#candidateTemplate').content.firstElementChild.cloneNode(true);
    card.dataset.symbol = candidate.symbol;
    card.querySelector('.symbol').textContent = candidate.symbol;
    card.querySelector('.name').textContent = candidate.name;
    card.querySelector('.metrics').innerHTML = [
      ['收盤', formatNumber(candidate.technical.close)], ['MA20', formatNumber(candidate.technical.ma20)],
      ['60日頸線', formatNumber(candidate.technical.prior60High)], ['20日均量', `${formatNumber(candidate.technical.averageVolume20)} 張`],
      ['法人集中度', formatPercent(candidate.institutional.concentration5d)], ['大戶兩週變化', formatPercent(candidate.holders.twoWeekLargeHolderChange)],
      ['券資比', formatPercent(candidate.credit.shortToMarginRatio)], ['融資壓力', candidate.credit.estimatedStress ? '估算警示' : '未觸發']
    ].map(([label, value]) => `<span><b>${label}</b><br>${value}</span>`).join('');
    bindReview(card, candidate);
    list.append(card);
  }
}

async function pollQuotes() {
  if (!snapshot?.allowNewRisk || !config.workerBaseUrl) return;
  const approved = (snapshot.candidates || []).filter(row => reviews[row.symbol]?.approved).slice(0, 3);
  if (!approved.length) return;
  try {
    const response = await fetch(`${config.workerBaseUrl}/api/v1/quotes?symbols=${approved.map(row => row.symbol).join(',')}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    for (const candidate of approved) {
      const quote = payload.quotes.find(row => row.symbol === candidate.symbol);
      const review = reviews[candidate.symbol];
      const card = document.querySelector(`[data-symbol="${candidate.symbol}"]`);
      if (!quote || !card) continue;
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      const elapsed = Number(parts.slice(0, 2)) * 60 + Number(parts.slice(3)) - 540;
      const projected = elapsed >= 30 ? quote.cumulativeVolumeLots / (elapsed / 270) : null;
      const fresh = quote.timestamp && Math.abs(now - new Date(quote.timestamp)) <= (config.quoteMaxAgeMs || 120000);
      const triggered = fresh && candidate.institutional.simultaneousBuy3d && candidate.credit.marginIncreased
        && quote.price > Number(review.neckline) && projected >= candidate.technical.averageVolume20 * 2;
      card.querySelector('.live-status').textContent = `即時 ${formatNumber(quote.price)}｜預估量 ${formatNumber(projected)} 張${triggered ? '｜突破條件成立' : ''}`;
      if (triggered) notifyOnce(candidate, quote);
    }
  } catch (error) {
    document.querySelector('#warnings').textContent = `盤中報價不可用：${error.message}`;
  }
}

function notifyOnce(candidate, quote) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const notified = loadJson(NOTIFY_KEY, {});
  const key = `${date}/${candidate.symbol}`;
  if (notified[key] || Notification.permission !== 'granted') return;
  new Notification(`${candidate.symbol} ${candidate.name} 突破警示`, { body: `價格 ${quote.price} 已突破人工頸線；請自行確認後決定是否下單。` });
  notified[key] = new Date().toISOString();
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(notified));
}

document.querySelector('#notifyButton').addEventListener('click', async () => {
  const permission = await Notification.requestPermission();
  document.querySelector('#notifyButton').textContent = permission === 'granted' ? '通知已啟用' : '通知未啟用';
});
document.querySelector('#exportButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), reviews }, null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `chip-lock-reviews-${Date.now()}.json` });
  link.click(); URL.revokeObjectURL(link.href);
});
document.querySelector('#importInput').addEventListener('change', async event => {
  const parsed = JSON.parse(await event.target.files[0].text());
  reviews = parsed.reviews || {};
  let accepted = 0;
  for (const review of Object.values(reviews)) {
    if (review.approved && (!reviewReady(review) || accepted >= 3)) review.approved = false;
    if (review.approved) accepted += 1;
  }
  saveReviews(); renderCandidates();
});

snapshot = await fetch('./data/latest.json', { cache: 'no-store' }).then(response => response.json());
renderStatus(); renderCandidates();
fetch('./data/backtest.json', { cache: 'no-store' }).then(response => response.json()).then(result => {
  document.querySelector('#backtestCard').innerHTML = result.status === 'COMPLETE'
    ? `<strong>策略 ${formatPercent(result.strategyReturn)}｜0050 ${formatPercent(result.benchmarkReturn)}｜超額 ${formatPercent(result.excessReturn)}</strong><span>${result.caveat}</span>`
    : `<strong>BLOCKED</strong><span>${result.reason}</span>`;
}).catch(error => { document.querySelector('#backtestCard').textContent = `回測資料不可用：${error.message}`; });
pollQuotes(); setInterval(pollQuotes, config.pollIntervalMs || 60000);
