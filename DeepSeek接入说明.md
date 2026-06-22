# DeepSeek 接入说明

本项目的 AI 报告优化功能通过 Cloudflare Pages Functions 调用 DeepSeek API。

## 1. 安全原则

不要把 DeepSeek API Key 写入：

- `src/` 前端代码
- GitHub 仓库
- 浏览器 localStorage
- 页面请求参数

API Key 只能配置在 Cloudflare Pages 的环境变量/密钥里，由后端函数读取。

## 2. Cloudflare Pages 配置

进入 Cloudflare Pages 项目：

```text
Workers 和 Pages -> tax-check-project -> 设置 -> 变量和密钥
```

添加变量：

```text
变量名：DEEPSEEK_API_KEY
变量值：你的 DeepSeek API Key
```

可选添加模型变量：

```text
变量名：DEEPSEEK_MODEL
变量值：deepseek-v4-flash
```

保存后，需要重新部署一次 Pages。

## 3. 当前接口

后端接口：

```text
POST /api/ai/report
```

用途：

- 校验当前用户登录状态
- 校验企业属于当前用户
- 把企业资料、命中风险、原始报告发送给 DeepSeek
- 返回优化后的报告正文
- 前端再把优化后的报告保存到 D1

## 4. 前端入口

进入报告预览页后，点击：

```text
AI 优化报告
```

系统会生成更专业、可读性更强的税务风险体检报告。

## 5. 密钥泄露处理

如果 API Key 已经出现在聊天记录、截图或公开仓库中，建议立刻：

1. 到 DeepSeek 后台禁用旧 key。
2. 新建一个 key。
3. 在 Cloudflare Pages 重新配置 `DEEPSEEK_API_KEY`。
4. 重新部署项目。
