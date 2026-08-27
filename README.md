# Reddit Comment Miner

从 Reddit 评论中挖掘用户痛点、需求与功能请求的 Chrome 扩展。

## 功能

- 🔍 在 Reddit 帖子评论页一键提取可见评论
- 🧠 调用用户自行配置的 OpenAI 兼容 LLM，分析评论中的痛点、需求、功能请求、疑问与反馈
- 📊 在 Chrome 侧边栏展示结构化分析结果
- 🕘 本地保存最近 10 次分析历史，方便回看对比
- 🔒 所有配置与数据仅存储在浏览器本地，不上传任何服务器

## 安装

### Chrome / Edge 浏览器（开发者模式）

1. 下载本插件文件夹（`extension/`）
2. 打开浏览器扩展管理页面：`chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展」
5. 选择 `extension/` 文件夹

### Chrome 应用商店

已发布到 Chrome Web Store，搜索 "Reddit Comment Miner" 即可安装。

## 使用

1. 打开任意 Reddit 帖子评论页（`https://www.reddit.com/r/*/comments/*`）
2. 点击浏览器右上角插件图标，打开 popup
3. 点击「分析当前帖子评论」按钮
4. 在 Chrome 侧边栏查看结构化洞察结果
5. 点击「历史记录」可查看最近 10 次分析

## 配置

| 配置项 | 必填 | 说明 |
|---|---|---|
| LLM Base URL | 可选 | OpenAI 兼容接口地址，如 `https://api.openai.com/v1` |
| LLM API Key | 可选 | 用户自有密钥，仅存在本地 |
| LLM 模型 | 可选 | 如 `gpt-4o-mini`、`gpt-4o` |
| Temperature | 可选 | 默认 `0.7` |
| System Prompt | 可选 | 自定义分析提示词 |

所有配置仅存储在浏览器 `chrome.storage.local` 中，**不上传任何服务器**。

## 技术栈

- Manifest V3
- Service Worker（`background.js`）
- Content Script（`content.js`）
- Chrome Side Panel API
- 任意 OpenAI 兼容 LLM（用户自配）

## 隐私政策

详见 [extension/privacy.md](extension/privacy.md)。

## License

MIT

---

## Author & Contact

**MountainClimberJiwen**

- 📧 Email: ljwscu@gmail.com
- 💬 WeChat: 扫码添加好友

  <img src="assets/wechat-contact-qr.jpg" width="200" alt="WeChat QR Code">

- 🐙 GitHub: [@MountainClimberJiwen](https://github.com/MountainClimberJiwen)

## Support This Project

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕

**Buy Me a Coffee** 🍵

<img src="assets/payment-qr.jpg" width="200" alt="Support QR Code">

> "每一杯咖啡，都是对一个工程师深夜写代码的温柔慰藉。"
