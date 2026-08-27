// sidepanel.js - 展示需求挖掘结果与历史记录

const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  pain_point: '痛点',
  feature_request: '功能请求',
  question: '疑问',
  feedback: '反馈',
  insight: '洞察'
};

let currentInsights = [];
let currentFilter = 'all';
let historyCache = [];

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN');
}

function renderStats(totalComments, insightCount) {
  $('commentCount').textContent = totalComments ?? '-';
  $('insightCount').textContent = insightCount ?? '-';
}

function renderFilters() {
  const container = $('filters');
  container.innerHTML = '';

  const categories = ['all', ...new Set(currentInsights.map((i) => i.category).filter(Boolean))];
  categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat === currentFilter ? ' active' : '');
    btn.textContent = cat === 'all' ? '全部' : (CATEGORY_LABELS[cat] || cat);
    btn.addEventListener('click', () => {
      currentFilter = cat;
      renderFilters();
      renderInsights();
    });
    container.appendChild(btn);
  });
}

function renderInsights() {
  const container = $('eventsContainer');
  container.innerHTML = '';

  const filtered = currentFilter === 'all'
    ? currentInsights
    : currentInsights.filter((i) => i.category === currentFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty">没有符合条件的结果。</div>';
    return;
  }

  filtered.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'event-item';

    const catClass = CATEGORY_LABELS[item.category] ? item.category : 'insight';
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];

    el.innerHTML = `
      <div class="event-header">
        <span class="event-mode ${catClass}">${CATEGORY_LABELS[item.category] || item.category || '洞察'}</span>
        <span class="event-confidence">置信度 ${item.confidence || '-'}/5</span>
      </div>
      <div class="event-title">${escapeHtml(item.summary || '未命名')}</div>
      <div class="event-desc">${escapeHtml(item.detail || '')}</div>
      ${evidence.length ? `<div class="event-evidence">${evidence.map((e) => `<div class="event-evidence-item">${escapeHtml(String(e))}</div>`).join('')}</div>` : ''}
    `;
    container.appendChild(el);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function displayResult(result) {
  currentInsights = Array.isArray(result.insights) ? result.insights : [];
  $('subtitle').textContent = `${result.title || 'Reddit 帖子'} · ${formatTime(result.analyzedAt)}`;
  renderStats(result.totalComments, currentInsights.length);
  renderFilters();
  renderInsights();
}

function displayError(message) {
  $('subtitle').textContent = '分析失败';
  $('eventsContainer').innerHTML = `<div class="empty" style="color:#cf1322;">${escapeHtml(message)}</div>`;
  $('filters').innerHTML = '';
  renderStats(0, 0);
}

async function loadLastResult() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'GET_LAST_RESULT' });
    if (result) {
      displayResult(result);
    }
  } catch (err) {
    console.error('加载缓存结果失败', err);
  }
}

function showMainView() {
  $('mainView').classList.remove('hidden');
  $('historyView').classList.add('hidden');
}

function showHistoryView() {
  $('mainView').classList.add('hidden');
  $('historyView').classList.remove('hidden');
  renderHistory();
}

function renderHistory() {
  const container = $('historyContainer');
  container.innerHTML = '';

  if (!historyCache || historyCache.length === 0) {
    container.innerHTML = '<div class="empty">暂无历史记录</div>';
    return;
  }

  historyCache.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-title">${escapeHtml(item.title || '未命名帖子')}</div>
      <div class="history-meta">
        <span>${item.totalComments || 0} 条评论 · ${(item.insights || []).length} 个洞察</span>
        <span>${formatTime(item.analyzedAt)}</span>
      </div>
    `;
    el.addEventListener('click', () => loadHistoryItem(index));
    container.appendChild(el);
  });
}

async function loadHistoryItem(index) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'LOAD_HISTORY_ITEM', index });
    if (response && response.success) {
      displayResult(response.result);
      showMainView();
    } else {
      alert(response?.error || '加载历史记录失败');
    }
  } catch (err) {
    console.error('加载历史记录失败', err);
    alert('加载历史记录失败');
  }
}

async function loadHistory() {
  try {
    historyCache = await chrome.runtime.sendMessage({ action: 'GET_HISTORY' }) || [];
  } catch (err) {
    console.error('加载历史记录失败', err);
    historyCache = [];
  }
}

// 监听 background 推送的新结果
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'ANALYSIS_RESULT' && request.result) {
    displayResult(request.result);
    showMainView();
    loadHistory();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  loadLastResult();

  $('openOptionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  $('historyBtn').addEventListener('click', () => {
    showHistoryView();
  });

  $('backBtn').addEventListener('click', () => {
    showMainView();
  });
});
