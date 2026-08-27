// options.js - LLM 设置页

const DEFAULT_PROMPT = `你是一位资深的产品需求分析师。请阅读以下 Reddit 帖子评论，从中挖掘用户痛点、需求、功能请求、疑虑和建设性反馈。

输出必须是严格的 JSON 数组，每个元素包含：
- category: 类别，只能是 "pain_point"（痛点）、"feature_request"（功能请求）、"question"（疑问）、"feedback"（反馈）、"insight"（洞察）之一
- summary: 一句话总结该需求/痛点（中文）
- detail: 详细说明，引用或概括相关评论（中文）
- evidence: 支持你判断的原文片段或作者名（数组）
- confidence: 置信度 1-5

只输出 JSON 数组，不要输出 markdown 代码块或其他说明。`;

const STORAGE_KEY = 'llmSettings';

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const settings = result[STORAGE_KEY] || {};
  $('baseUrl').value = settings.baseUrl || '';
  $('apiKey').value = settings.apiKey || '';
  $('model').value = settings.model || 'gpt-4o-mini';
  $('temperature').value = typeof settings.temperature === 'number' ? settings.temperature : 0.5;
  $('systemPrompt').value = settings.systemPrompt || DEFAULT_PROMPT;
}

function showStatus(text, type = 'info', autoClear = true) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + type;
  if (autoClear) {
    setTimeout(() => {
      el.textContent = '';
      el.className = 'status';
    }, 5000);
  }
}

function getSettingsFromUI() {
  const baseUrl = $('baseUrl').value.trim();
  const apiKey = $('apiKey').value.trim();
  const model = $('model').value.trim() || 'gpt-4o-mini';
  const temperature = parseFloat($('temperature').value);
  const systemPrompt = $('systemPrompt').value.trim();

  if (!baseUrl) throw new Error('请填写 Base URL');
  if (!apiKey) throw new Error('请填写 API Key');

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    temperature: isNaN(temperature) ? 0.5 : temperature,
    systemPrompt
  };
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
  return chrome.permissions.request({ origins: [origin] });
}

async function testLLMConnection() {
  const settings = getSettingsFromUI();
  const endpoint = resolveEndpoint(settings.baseUrl);

  const granted = await ensureHostPermission(settings.baseUrl);
  if (!granted) throw new Error('未获得 LLM 域名访问权限');

  const body = {
    model: settings.model,
    temperature: settings.temperature,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say exactly "OK" and nothing else.' }
    ]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

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
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return { ok: true, content };
  } finally {
    clearTimeout(timer);
  }
}

async function saveSettings() {
  try {
    const settings = getSettingsFromUI();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });

    // 请求 LLM 域名权限
    try {
      const origin = originPattern(settings.baseUrl);
      if (origin) {
        const granted = await chrome.permissions.contains({ origins: [origin] });
        if (!granted) {
          await chrome.permissions.request({ origins: [origin] });
        }
      }
    } catch {
      // 忽略权限请求失败
    }

    showStatus('设置已保存', 'success');
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

async function handleTestLLM() {
  const btn = $('testBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>测试中...';
  showStatus('正在测试 LLM 连接...', 'info', false);

  try {
    const result = await testLLMConnection();
    showStatus(`连接成功 ✅\n模型返回：${result.content}`, 'success');
  } catch (err) {
    showStatus(`连接失败 ❌\n${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  $('saveBtn').addEventListener('click', saveSettings);
  $('testBtn').addEventListener('click', handleTestLLM);
  $('resetBtn').addEventListener('click', () => {
    $('systemPrompt').value = DEFAULT_PROMPT;
  });
});
