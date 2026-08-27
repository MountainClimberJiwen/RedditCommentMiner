// popup.js - 触发分析

const $ = (id) => document.getElementById(id);

function isRedditCommentsPage(url) {
  return url && url.includes('reddit.com/r/') && url.includes('/comments/');
}

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + type;
}

async function openSidepanel() {
  const currentWindow = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({ windowId: currentWindow.id });
}

function openSidepanelSync() {
  // 在用户手势同步调用里打开侧边栏，避免异步后 gesture 失效
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const analyzeBtn = $('analyzeBtn');
  const btnText = $('btnText');

  if (!tab || !isRedditCommentsPage(tab.url)) {
    setStatus('请在 Reddit 帖子评论页面（/r/xxx/comments/...）使用本扩展。', 'error');
    analyzeBtn.disabled = true;
    return;
  }

  // 读取分析状态、缓存结果和历史记录
  let hasCachedResult = false;
  const status = await chrome.runtime.sendMessage({ action: 'GET_ANALYSIS_STATUS' });
  const inProgress = status?.inProgress;
  const history = status?.history || [];
  const result = history.find((item) => item.url === tab.url) || status?.lastResult;

  // 如果当前页面正在分析中，禁用按钮并提示
  if (inProgress && inProgress.tabId === tab.id) {
    analyzeBtn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span>分析中...';
    setStatus('正在提取评论并调用 LLM，请稍候...');
    return;
  }

  if (result && result.url === tab.url) {
    hasCachedResult = true;
    setStatus(`已缓存结果：${result.totalComments} 条评论，${result.insights?.length || 0} 个洞察。`, 'success');
    btnText.textContent = '重新分析';
  } else {
    try {
      const extraction = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_COMMENTS' });
      if (extraction && extraction.success) {
        setStatus(`检测到 ${extraction.totalVisible} 条可见评论，点击开始分析。`);
      } else {
        setStatus(extraction?.error || '未检测到评论，请刷新页面后重试。', 'error');
        analyzeBtn.disabled = true;
        return;
      }
    } catch (err) {
      setStatus('无法与页面通信，请刷新 Reddit 页面后重试。', 'error');
      analyzeBtn.disabled = true;
      return;
    }
  }

  analyzeBtn.disabled = false;
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span>分析中...';
    setStatus('正在提取评论并调用 LLM，请稍候...');

    // 先同步打开侧边栏（必须在用户手势内调用），再执行异步分析
    try { openSidepanelSync(); } catch {}

    try {
      // 把触发分析时的标签页 ID 传给 background，避免分析过程中切换页面导致目标丢失
      const response = await chrome.runtime.sendMessage({ action: 'ANALYZE_COMMENTS', tabId: tab.id });
      if (response && response.success) {
        setStatus(`分析完成：${response.result.totalComments} 条评论，${response.result.insights?.length || 0} 个洞察。`, 'success');
        window.close();
      } else {
        setStatus(response?.error || '分析失败', 'error');
      }
    } catch (err) {
      setStatus(`分析出错：${err.message}`, 'error');
    } finally {
      analyzeBtn.disabled = false;
      btnText.textContent = hasCachedResult ? '重新分析' : '分析当前帖子评论';
    }
  });
}

$('openSidepanelBtn').addEventListener('click', async () => {
  await openSidepanel();
  window.close();
});

$('openOptionsBtn').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

$('openSidepanelLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await openSidepanel();
  window.close();
});

document.addEventListener('DOMContentLoaded', init);
