# 隐私政策 — Reddit Comment Miner

> 最后更新：2026-08-27
> 适用版本：v1.0 及以上
> 适用扩展：`Reddit Comment Miner`（Chrome / Manifest V3）

本政策说明 `Reddit Comment Miner`（以下简称「本扩展」）如何处理用户数据。**本扩展不收集、不上传、不出售任何用户数据给扩展作者或第三方。** 所有核心数据处理均在用户本机完成；仅当用户主动配置并启用时，才会将 Reddit 评论内容发送至用户自行指定的大语言模型（LLM）接口。

---

## 1. 本扩展做什么

本扩展**仅**用于辅助用户在浏览 Reddit 帖子评论页（`https://www.reddit.com/r/*/comments/*`）时：

- 从当前页面提取可见的 Reddit 评论（作者、文本、点赞数、时间、层级等）；
- 在本地调用用户**自行配置**的 OpenAI 兼容 LLM 接口，分析评论中的痛点、需求、功能请求、疑问与反馈；
- 在 Chrome 侧边栏展示结构化分析结果；
- 在本地保存最近 **10 次**分析结果（含原始评论与分析洞察），供用户通过「历史记录」按钮回看。

本扩展不替代 Reddit 官方功能，不抓取 Reddit 以外网站的内容。

---

## 2. 本扩展**不**做什么

为避免歧义，先明确不涉及的事项：

- ❌ 不收集任何用户身份信息（姓名、手机号、身份证、地址等）；
- ❌ 不向任何由扩展作者控制的服务器上报任何数据；
- ❌ 不嵌入任何第三方分析、统计、广告、追踪 SDK；
- ❌ 不读取、修改、上传用户的其他浏览器标签页内容；
- ❌ 不加载、不执行任何远程代码（所有 JS 均打包在扩展包内，遵循 `script-src 'self'`）；
- ❌ 不出售、租赁、交换任何用户数据。

---

## 3. 权限与对应的数据处理

下表列出 `manifest.json` 中声明的每一项权限、其使用场景与数据影响。

| 权限 / host | 使用场景 | 读取的数据 | 写入的数据 | 传输的数据 |
|---|---|---|---|---|
| `activeTab` | 用户点击工具栏图标打开 popup | 当前激活的 Reddit 评论页 DOM（仅此次） | 无 | 无 |
| `scripting` | 通过 `chrome.scripting.executeScript` 在 Reddit 页面注入打包在扩展内的函数 | 同上 | 无 | 无 |
| `tabs` | 获取当前激活标签页以确定分析目标 | 标签页 URL / id | 无 | 无 |
| `sidePanel` | 在 Chrome 侧边栏展示分析结果与历史记录 | `chrome.storage.local` 中的结果记录 | 无 | 无 |
| `storage` | 在本地保存扩展配置与分析结果 | 用户填写的配置项、分析结果 | 同左 | 无（仅在用户主动调用外部 API 时携带，见下） |
| `host_permissions`（`https://www.reddit.com/*`） | 限定内容脚本运行范围到 Reddit 评论页 | Reddit 页面 DOM | 无 | 无 |
| `host_permissions`（`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`） | 允许扩展向用户自定义的 LLM 接口发起请求 | 无 | 无 | Reddit 评论文本（仅在用户点击「分析」后） |

---

## 4. 数据存储（`chrome.storage.local`）

下表列出扩展写入本地存储的所有键。**所有数据均仅存储在用户本机的 `chrome.storage.local` 中，不上传任何服务器。**

| 键名 | 内容 | 保留期限 | 用途 |
|---|---|---|---|
| `llmSettings` | 用户的 LLM 接入参数（Base URL、API Key、模型名、Temperature、System Prompt） | 直至用户在选项页删除或清空扩展数据 | 调用用户配置的 LLM 分析评论 |
| `lastAnalysisResult` | 最近一次分析结果（URL、标题、评论数、洞察列表） | 被下一次分析结果覆盖 | 侧边栏默认展示 |
| `analysisHistory` | 最近 10 次分析结果（含原始评论与洞察） | 最多保留 10 条，超出后自动移除最旧记录 | 历史记录功能 |
| `analysisInProgress` | 当前分析状态（tabId、URL、开始时间） | 分析完成或出错后立即清除 | 防止重复点击与分析中状态展示 |

用户可随时通过以下任一方式清除全部本地数据：

- 进入 `chrome://extensions/` → 找到本扩展 → 点击「移除」；
- 或在扩展选项页中清空 LLM 配置并保存。

---

## 5. 数据传输

本扩展**仅在用户主动点击 popup 中的「分析当前帖子评论」按钮时**，才会向外部地址发起网络请求。所有请求均为 `fetch()` 数据请求，**响应内容仅作为文本/JSON 数据使用，不被执行或注入到 DOM 中**。

### 5.1 LLM 分析（用户启用后）

- 请求方式：`POST {用户配置的 Base URL}/v1/chat/completions`（若用户填入完整路径则原样使用）
- 请求头：`Authorization: Bearer {用户的 API Key}`、`Content-Type: application/json`
- 请求体：模型名 + 系统提示 + 用户提示（当前 Reddit 帖子的可见评论文本）
- 响应处理：取 `choices[0].message.content`，解析为 JSON 数组后展示在侧边栏
- **数据传输范围完全由用户控制**：用户填什么端点、什么 Key，数据就发往哪里；扩展作者不参与也不可见

### 5.2 LLM 连接测试（用户主动点击）

- 请求方式：`POST {用户配置的 Base URL}/v1/chat/completions`
- 请求内容：极简提示（`Say exactly "OK"`）
- 目的：验证用户配置的 LLM 接口可连通

---

## 6. 远程代码

本扩展**不加载、不执行任何远程代码**：

- `manifest_version: 3` 默认 CSP 为 `script-src 'self'`，已禁止远程脚本；
- 扩展包内不含 `eval()`、`new Function()`、`<script src=…>`、动态注入；
- 所有 `chrome.scripting.executeScript` 注入的函数均为打包在扩展内的静态源码；
- LLM 响应**仅作为数据使用**，不被执行或注入到 DOM 中作为可执行代码。

---

## 7. 用户控制

用户对本扩展拥有完全控制权：

- ✅ 随时修改或清空 LLM 配置
- ✅ 随时打开/关闭侧边栏
- ✅ 随时在历史记录中查看或切换过往分析
- ✅ 随时移除扩展（清除全部本地数据）
- ✅ 通过 Chrome 的「网站权限」撤销 `https://www.reddit.com/*` 或 LLM 接口域名的访问权

---

## 8. 政策变更

如本政策发生重大变更，会在新版本发布前：

1. 在扩展选项页内显示显著提示；
2. 更新本文件的「最后更新」日期；
3. 在 Chrome Web Store 商品详情页的「更新内容」中说明。

---

## 9. 联系

如对本政策有任何疑问、申诉或建议，请通过以下方式联系：

- **GitHub Issues**：`https://github.com/MountainClimberJiwen/RedditCommentMiner/issues`
- **邮箱**：ljwscu@gmail.com

---

## 10. 许可

本隐私政策基于「用户优先」原则撰写，参考 Google Chrome Web Store 开发者计划政策与 GDPR / 中国《个人信息保护法》对最小必要、透明可控的要求。如 Chrome 商店审核过程中对本政策提出修改建议，会在 5 个工作日内更新。
