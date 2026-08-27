// background.js - 消息路由、LLM 调用与结果缓存

const STORAGE_KEYS = {
  LLM: 'llmSettings',
  LAST_RESULT: 'lastAnalysisResult',
  IN_PROGRESS: 'analysisInProgress',
  HISTORY: 'analysisHistory'
};

const MAX_HISTORY_ITEMS = 10;

const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟后认为分析已卡死

const DEFAULT_PROMPT = `你是一位资深的产品需求分析师。请阅读以下 Reddit 帖子评论，从中挖掘用户痛点、需求、功能请求、疑虑和建设性反馈。

输出必须是严格的 JSON 数组，每个元素包含：
- category: 类别，只能是 "pain_point"（痛点）、"feature_request"（功能请求）、"question"（疑问）、"feedback"（反馈）、"insight"（洞察）之一
- summary: 一句话总结该需求/痛点（中文）
- detail: 详细说明，引用或概括相关评论（中文）
- evidence: 支持你判断的原文片段或作者名（数组）
- confidence: 置信度 1-5

只输出 JSON 数组，不要输出 markdown 代码块或其他说明。`;

async function getLLMSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.LLM], (result) => {
      resolve(result[STORAGE_KEYS.LLM] || null);
    });
  });
}

async function saveResultWithHistory(result) {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], (res) => {
      const history = res[STORAGE_KEYS.HISTORY] || [];
      // 去重：如果同一 URL 已有记录，替换为最新
      const filtered = history.filter((item) => item.url !== result.url);
      filtered.unshift(result);
      const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);
      chrome.storage.local.set({
        [STORAGE_KEYS.LAST_RESULT]: result,
        [STORAGE_KEYS.HISTORY]: trimmed
      }, resolve);
    });
  });
}

function resolveEndpoint(baseUrl) {
  const url = (baseUrl || '').replace(/\/+$/, '');
  if (!url) return '';
  if (url.endsWith('/chat/completions')) return url;
  if (/\/v\d+$/.test(url)) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

function originPattern(baseUrl) {
  try {
    return `${new URL(baseUrl).origin}/*`;
  } catch {
    return null;
  }
}

async function ensureHostPermission(baseUrl) {
  const origin = originPattern(baseUrl);
  if (!origin) return true;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (granted) return true;
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [origin] }, resolve);
  });
}

async function callLLM(settings, commentsText) {
  const endpoint = resolveEndpoint(settings.baseUrl);
  if (!endpoint) throw new Error('未配置 LLM 接口地址');
  if (!settings.apiKey) throw new Error('未配置 LLM API Key');

  const granted = await ensureHostPermission(settings.baseUrl);
  if (!granted) throw new Error('未获得 LLM 域名访问权限');

  const body = {
    model: settings.model || 'gpt-4o-mini',
    temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.5,
    messages: [
      { role: 'system', content: settings.systemPrompt || DEFAULT_PROMPT },
      { role: 'user', content: commentsText }
    ]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let parsed = {};
      try { parsed = JSON.parse(text); } catch {}
      const msg =
        parsed?.error?.message ||
        parsed?.message ||
        text.slice(0, 300) ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function buildCommentsContext(comments) {
  const lines = [];
  comments.forEach((c) => {
    const indent = '  '.repeat(c.depth);
    lines.push(`${indent}[${c.depth}] ${c.author} (${c.score}↑): ${c.text.replace(/\n/g, ' ')}`);
  });
  return lines.join('\n');
}

function parseLLMJson(content) {
  if (typeof content !== 'string') {
    throw new Error('LLM 返回内容不是字符串');
  }

  // 1. 去掉 <think>...</think> 等推理标签
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. 去掉 markdown 代码块标记
  cleaned = cleaned.replace(/^```json\s*|\s*```$/g, '').trim();

  // 3. 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // 4. 尝试从文本中提取第一个 JSON 数组
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {}
    }
  }

  throw new Error('LLM 返回无法解析为 JSON，请检查模型是否按要求输出数组');
}

async function analyzeCurrentTab(targetTabId) {
  let tab;
  if (targetTabId) {
    tab = await chrome.tabs.get(targetTabId);
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  }

  if (!tab) throw new Error('无法获取目标标签页');
  if (!tab.url || !tab.url.includes('reddit.com/r/') || !tab.url.includes('/comments/')) {
    throw new Error('请在 Reddit 帖子评论页面使用');
  }

  // 标记分析进行中
  await chrome.storage.local.set({
    [STORAGE_KEYS.IN_PROGRESS]: { tabId: tab.id, url: tab.url, startedAt: Date.now() }
  });

  // 通过 keep-alive 日志维持 service worker 活跃，避免长 LLM 调用期间被回收
  const keepAlive = setInterval(() => {
    console.log('[Reddit Comment Miner] 分析 keep-alive');
  }, 5000);

  try {
    console.log('[Reddit Comment Miner] 开始提取评论, tabId=', tab.id, 'url=', tab.url);
    const extraction = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_COMMENTS' });
    if (!extraction || !extraction.success) {
      throw new Error(extraction?.error || '评论提取失败');
    }
    if (!extraction.flat || extraction.flat.length === 0) {
      throw new Error('当前页面未找到评论');
    }
    console.log('[Reddit Comment Miner] 提取评论成功, 数量=', extraction.flat.length);

    const settings = await getLLMSettings();
    if (!settings || !settings.baseUrl || !settings.apiKey) {
      throw new Error('请先在扩展选项中配置 LLM');
    }

    const context = buildCommentsContext(extraction.flat);
    console.log('[Reddit Comment Miner] 开始调用 LLM, model=', settings.model);
    const rawResult = await callLLM(settings, context);
    console.log('[Reddit Comment Miner] LLM 返回长度=', rawResult?.length);
    const insights = parseLLMJson(rawResult);
    console.log('[Reddit Comment Miner] 解析洞察数量=', insights?.length);

    const result = {
      success: true,
      url: extraction.url,
      title: extraction.title,
      totalComments: extraction.flat.length,
      analyzedAt: Date.now(),
      insights,
      comments: extraction.flat
    };

    await saveResultWithHistory(result);

    // 通知 sidepanel 更新
    try {
      await chrome.runtime.sendMessage({ action: 'ANALYSIS_RESULT', result });
    } catch {
      // sidepanel 可能未打开，忽略
    }

    return result;
  } catch (err) {
    console.error('[Reddit Comment Miner] 分析失败:', err);
    throw err;
  } finally {
    clearInterval(keepAlive);
    console.log('[Reddit Comment Miner] 清理分析中状态');
    await chrome.storage.local.remove(STORAGE_KEYS.IN_PROGRESS);
  }
}

function isStaleInProgress(inProgress) {
  if (!inProgress || !inProgress.startedAt) return true;
  return Date.now() - inProgress.startedAt > STALE_TIMEOUT_MS;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ANALYZE_COMMENTS') {
    chrome.storage.local.get([STORAGE_KEYS.IN_PROGRESS], async (res) => {
      const inProgress = res[STORAGE_KEYS.IN_PROGRESS];
      if (inProgress && inProgress.tabId === request.tabId && !isStaleInProgress(inProgress)) {
        sendResponse({ success: false, error: '该页面正在分析中，请稍候' });
        return;
      }

      // 如果存在过期状态，先清理
      if (inProgress && isStaleInProgress(inProgress)) {
        await chrome.storage.local.remove(STORAGE_KEYS.IN_PROGRESS);
      }

      analyzeCurrentTab(request.tabId)
        .then((result) => sendResponse({ success: true, result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === 'GET_LAST_RESULT') {
    chrome.storage.local.get([STORAGE_KEYS.LAST_RESULT], (res) => {
      sendResponse(res[STORAGE_KEYS.LAST_RESULT] || null);
    });
    return true;
  }

  if (request.action === 'GET_ANALYSIS_STATUS') {
    chrome.storage.local.get([STORAGE_KEYS.IN_PROGRESS, STORAGE_KEYS.LAST_RESULT, STORAGE_KEYS.HISTORY], async (res) => {
      let inProgress = res[STORAGE_KEYS.IN_PROGRESS] || null;
      if (inProgress && isStaleInProgress(inProgress)) {
        await chrome.storage.local.remove(STORAGE_KEYS.IN_PROGRESS);
        inProgress = null;
      }
      sendResponse({
        inProgress,
        lastResult: res[STORAGE_KEYS.LAST_RESULT] || null,
        history: res[STORAGE_KEYS.HISTORY] || []
      });
    });
    return true;
  }

  if (request.action === 'GET_HISTORY') {
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], (res) => {
      sendResponse(res[STORAGE_KEYS.HISTORY] || []);
    });
    return true;
  }

  if (request.action === 'LOAD_HISTORY_ITEM') {
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], (res) => {
      const history = res[STORAGE_KEYS.HISTORY] || [];
      const item = history[request.index];
      if (item) {
        chrome.storage.local.set({ [STORAGE_KEYS.LAST_RESULT]: item });
        sendResponse({ success: true, result: item });
      } else {
        sendResponse({ success: false, error: '未找到历史记录' });
      }
    });
    return true;
  }
});
