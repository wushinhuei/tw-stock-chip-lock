const REVIEW_KEY = 'tw-stock-chip-lock/research/v2';
let snapshot;
let reviews = loadJson(REVIEW_KEY, {});

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveReviews() { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews)); }
function formatPercent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—'; }
function formatNumber(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-TW', { maximumFractionDigits: 1 }) : '—'; }
function grade(score) { return score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : '—'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

async function loadPageData(url, offlineValue) {
  if (location.protocol !== 'file:') {
    try { const response = await fetch(url, { cache: 'no-store' }); if (response.ok) return response.json(); } catch {}
  }
  if (offlineValue) return structuredClone(offlineValue);
  throw new Error(`無法讀取 ${url}`);
}

function adjusted(candidate) {
  const review = reviews[candidate.symbol] || {};
  const penalties = (review.daytradeRisk ? 10 : 0) + (review.highLevelStagnation ? 10 : 0) + (review.longUpperShadow ? 10 : 0);
  const score = Math.max(0, candidate.score - penalties);
  return { review, score, grade: grade(score), penalties };
}

function renderStatus() {
  const badge = document.querySelector('#statusBadge');
  badge.textContent = snapshot.candidateStatus;
  badge.className = `status ${snapshot.candidateStatus === 'VERIFIED' ? 'complete' : snapshot.candidateStatus === 'PROVISIONAL' ? 'partial' : 'blocked'}`;
  document.querySelector('#statusText').textContent = snapshot.candidateStatus === 'VERIFIED'
    ? '官方資料完整，顯示已驗證潛力榜。' : snapshot.candidateStatus === 'PROVISIONAL'
      ? '核心市場資料可用；TDCC、月營收或人工資料尚未完整，顯示暫定榜。' : '核心價格、法人或資券資料不可用，暫停產生名單。';
  document.querySelector('#generatedAt').textContent = snapshot.generatedAt ? `更新 ${new Date(snapshot.generatedAt).toLocaleString('zh-TW')}` : '尚未更新';
  const sources = snapshot.manifest?.sources || {};
  document.querySelector('#sourceCards').innerHTML = Object.entries(sources).map(([name, source]) =>
    `<div><strong>${name.toUpperCase()}</strong><span>${source.provider || '—'}</span><span>日期 ${source.date || '缺漏'}</span><span>${source.rows ?? 0} 筆${source.months ? `／${source.months}月` : ''}</span></div>`).join('') || '<div>尚無來源資料</div>';
  document.querySelector('#warnings').textContent = (snapshot.manifest?.warnings || []).join('；');
}

function renderSummary() {
  const rows = snapshot.potentialStocks || [];
  const counts = ['A', 'B', 'C'].map(level => rows.filter(row => row.grade === level).length);
  const revenueHigh = rows.filter(row => row.revenue?.revenue36mHigh).length;
  const cards = [
    ['本期入榜', rows.length, '最多20檔'], ['A級', counts[0], '80分以上'], ['B級', counts[1], '65–79分'], ['C級', counts[2], '50–64分'], ['營收新高', revenueHigh, '近36個月']
  ];
  document.querySelector('#summaryCards').innerHTML = cards.map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  const provisional = document.querySelector('#provisionalNote');
  if (snapshot.candidateStatus === 'PROVISIONAL') {
    provisional.hidden = false;
    provisional.textContent = '暫定榜：缺漏分項不假設為零，依可用分項等比例換算；卡片同時顯示原始分數／可用分母。TDCC累積三週後會自動改回完整100分制。';
  } else provisional.hidden = true;
}

function bindReview(card, candidate) {
  const review = reviews[candidate.symbol] || {};
  const fields = {
    branchConcentration20d: '.branch-concentration', sourceDate: '.source-date', sourceUrl: '.source-url', notes: '.notes',
    tracked: '.tracked', excluded: '.excluded', mopsRiskChecked: '.mops-checked', daytradeRisk: '.daytrade-risk',
    highLevelStagnation: '.stagnation', longUpperShadow: '.upper-shadow'
  };
  for (const [key, selector] of Object.entries(fields)) {
    const input = card.querySelector(selector);
    input[input.type === 'checkbox' ? 'checked' : 'value'] = review[key] ?? (input.type === 'checkbox' ? false : '');
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
      reviews[candidate.symbol] = { ...(reviews[candidate.symbol] || {}), [key]: value };
      saveReviews(); renderCandidates();
    });
  }
}

function renderCandidates() {
  const showExcluded = document.querySelector('#showExcluded').checked;
  const all = snapshot.potentialStocks || [];
  const query = document.querySelector('#searchInput').value.trim().toLowerCase();
  const gradeValue = document.querySelector('#gradeFilter').value;
  const revenueValue = document.querySelector('#revenueFilter').value;
  const rows = all.filter(row => (showExcluded || !reviews[row.symbol]?.excluded)
    && (!query || row.symbol.includes(query) || row.name.toLowerCase().includes(query))
    && (!gradeValue || adjusted(row).grade === gradeValue)
    && (!revenueValue || (revenueValue === 'high') === Boolean(row.revenue?.revenue36mHigh)));
  document.querySelector('#candidateCount').textContent = `顯示 ${rows.length}／${all.length} 檔`;
  const list = document.querySelector('#candidateList'); list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="empty">目前沒有符合基本門檻且達50分的潛力股；系統不會降低條件湊數。</div>'; return; }
  for (const candidate of rows) {
    const card = document.querySelector('#candidateTemplate').content.firstElementChild.cloneNode(true);
    const local = adjusted(candidate);
    if (local.review.excluded) card.classList.add('excluded-card');
    card.querySelector('.rank').textContent = `#${all.indexOf(candidate) + 1}`; card.querySelector('.symbol').textContent = candidate.symbol; card.querySelector('.name').textContent = candidate.name;
    card.querySelector('.grade').textContent = `${local.grade}級`; card.querySelector('.score').textContent = `${local.score.toFixed(1)}分`;
    card.querySelector('.badges').innerHTML = `<span class="status ${candidate.candidateStatus === 'VERIFIED' ? 'complete' : 'partial'}">${candidate.candidateStatus}</span>${candidate.revenue.revenue36mHigh ? '<span class="status complete">營收36月新高</span>' : ''}`;
    card.querySelector('.metrics').innerHTML = [
      ['收盤', formatNumber(candidate.technical.close)], ['距頸線', formatPercent(candidate.technical.necklineDistance)],
      ['20日漲幅', formatPercent(candidate.technical.return20d)], ['法人集中度', formatPercent(candidate.institutional.concentration5d)],
      ['大戶兩週變化', formatPercent(candidate.holders.twoWeekLargeHolderChange)], ['最新月營收', formatNumber(candidate.revenue.monthlyRevenue)],
      ['營收年增', formatPercent(candidate.revenue.revenueYoY)], ['評分基礎', `${candidate.rawScore ?? candidate.score}/${candidate.scoreDenominator ?? 100}`], ['人工扣分', local.penalties]
    ].map(([label, value]) => `<span><b>${label}</b><br>${value}</span>`).join('');
    card.querySelector('.reasons').innerHTML = `<p><b>正向：</b>${candidate.positiveReasons.join('；') || '無額外加分理由'}</p><p class="warnings"><b>風險：</b>${candidate.riskReasons.join('；') || '未觸發自動扣分'}</p>`;
    const labels = { holders: '大戶籌碼', institutional: '法人籌碼', technical: '技術蓄勢', revenue: '月營收', credit: '資券結構', liquidity: '流動性', penalties: '自動扣分' };
    const maximums = { holders: 25, institutional: 25, technical: 25, revenue: 15, credit: 5, liquidity: 5, penalties: 10 };
    card.querySelector('.score-breakdown').innerHTML = Object.entries(candidate.scoreBreakdown).map(([key, value]) => {
      const width = key === 'penalties' ? Math.min(100, Math.abs(value) / 10 * 100) : Math.min(100, value / maximums[key] * 100);
      return `<div class="score-row"><span>${escapeHtml(labels[key] || key)}</span><div><i class="${key === 'penalties' ? 'negative' : ''}" style="width:${width}%"></i></div><b>${value}</b></div>`;
    }).join('');
    bindReview(card, candidate); list.append(card);
  }
}

for (const id of ['showExcluded', 'searchInput', 'gradeFilter', 'revenueFilter']) document.querySelector(`#${id}`).addEventListener(id === 'searchInput' ? 'input' : 'change', renderCandidates);
document.querySelector('#toggleSources').addEventListener('click', event => {
  const panel = document.querySelector('#sourcePanel'); panel.hidden = !panel.hidden; event.currentTarget.textContent = panel.hidden ? '展開來源' : '收合來源';
});
document.querySelector('#exportButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), reviews }, null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `potential-stock-research-${Date.now()}.json` });
  link.click(); URL.revokeObjectURL(link.href);
});
document.querySelector('#importInput').addEventListener('change', async event => { reviews = JSON.parse(await event.target.files[0].text()).reviews || {}; saveReviews(); renderCandidates(); });

async function initialize() {
  try { snapshot = await loadPageData('./data/latest.json', globalThis.__CHIP_LOCK_SNAPSHOT__); }
  catch (error) { snapshot = { candidateStatus: 'UNAVAILABLE', potentialStocks: [], manifest: { sources: {}, warnings: [error.message] } }; }
  renderStatus(); renderSummary(); renderCandidates();
  loadPageData('./data/outcomes.json', globalThis.__CHIP_LOCK_OUTCOMES__).then(result => {
    const summary = result.summary || {};
    document.querySelector('#outcomeCard').innerHTML = `<strong>累積 ${summary.total || 0} 筆／完成20日 ${summary.completed || 0} 筆</strong><span>只追蹤入榜後5、10、20日表現，不模擬持倉或交易。</span>`;
  }).catch(error => { document.querySelector('#outcomeCard').textContent = `觀察紀錄不可用：${error.message}`; });
}
initialize();
