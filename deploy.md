# Cloudflare Workers 部署指南

使用 Cloudflare REST API 直接部署 Worker，无需安装 Wrangler CLI。

---

## 前置条件

1. **Cloudflare 账号**：注册 [cloudflare.com](https://cloudflare.com)
2. **API Token**：创建具有 Workers 权限的 Token
3. **Account ID**：在 Dashboard 概览页面获取

### 获取 API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 复制生成的 Token

### 获取 Account ID

```bash
curl -s -H "Authorization: Bearer <API_TOKEN>" \
  "https://api.cloudflare.com/client/v4/accounts" | python -m json.tool
```

---

## 部署命令

### 基本格式

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/<WORKER_NAME>" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -F '<FILENAME>=@<LOCAL_PATH>;type=application/javascript' \
  -F 'metadata={"body_part":"<FILENAME>"};type=application/json'
```

### 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `ACCOUNT_ID` | Cloudflare 账户 ID | 在 Dashboard 获取 |
| `API_TOKEN` | API Token | `cfut_xxxx...` |
| `WORKER_NAME` | Worker 名称（自定义） | `gh-proxy` |
| `FILENAME` | 上传的文件名 | `index.js` |
| `LOCAL_PATH` | 本地文件路径 | `/tmp/gh-proxy/index.js` |

---

## 完整部署流程

### 1. 准备代码

```bash
mkdir -p /tmp/gh-proxy

cat > /tmp/gh-proxy/index.js << 'EOF'
'use strict'

addEventListener('fetch', e => {
  e.respondWith(handleRequest(e.request))
})

async function handleRequest(request) {
  return new Response('Hello World!', {
    headers: { 'content-type': 'text/plain' }
  })
}
EOF
```

### 2. 部署到 Cloudflare

```bash
ACCOUNT_ID="your_account_id"
API_TOKEN="your_api_token"
WORKER_NAME="my-worker"

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -F 'index.js=@/tmp/gh-proxy/index.js;type=application/javascript' \
  -F 'metadata={"body_part":"index.js"};type=application/json'
```

**成功响应：**
```json
{
  "result": {
    "id": "my-worker",
    "etag": "...",
    "handlers": ["fetch"]
  },
  "success": true
}
```

### 3. 启用 workers.dev 访问

```bash
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

访问地址：`https://<WORKER_NAME>.<SUBDOMAIN>.workers.dev`

### 4. 绑定自定义域名（可选）

#### 获取 Zone ID

```bash
curl -s -H "Authorization: Bearer ${API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones?name=example.com" | python -m json.tool
```

#### 添加路由

```bash
ZONE_ID="your_zone_id"

curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "gh.example.com/*", "script": "my-worker"}'
```

---

## 其他常用 API

### 查看 Worker 列表

```bash
curl -s -H "Authorization: Bearer ${API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts"
```

### 获取 Worker 代码

```bash
curl -s -H "Authorization: Bearer ${API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}"
```

### 删除 Worker

```bash
curl -s -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}"
```

### 查看路由列表

```bash
curl -s -H "Authorization: Bearer ${API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes"
```

### 删除路由

```bash
curl -s -X DELETE \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes/<ROUTE_ID>" \
  -H "Authorization: Bearer ${API_TOKEN}"
```

---

## Service Worker vs ES Module 格式

### Service Worker 格式（传统）

```javascript
// 使用 addEventListener
addEventListener('fetch', e => {
  e.respondWith(new Response('Hello'))
})
```

**部署 metadata：**
```json
{"body_part": "index.js"}
```

### ES Module 格式（推荐）

```javascript
// 使用 export default
export default {
  async fetch(request, env, ctx) {
    return new Response('Hello')
  }
}
```

**部署 metadata：**
```json
{"main_module": "index.js", "compatibility_date": "2025-01-01"}
```

---

## 常见问题

### Q: 部署返回 401 Unauthorized？

A: 检查 API Token 是否正确，是否有 Workers 权限。

### Q: 部署返回 10021 错误？

A: Service Worker 格式使用 `body_part`，ES Module 格式使用 `main_module`。

### Q: 部署成功但代码没更新？

A: Cloudflare 有缓存机制，等待几秒后重试，或检查文件路径是否正确。

### Q: Windows 路径问题？

A: 将文件复制到 `/tmp` 目录后再部署：
```bash
cp "C:\path\to\file.js" /tmp/gh-proxy/index.js
```

### Q: 如何查看部署日志？

A: 使用 Tail Workers 或在 Dashboard 的 Worker 页面查看 Logs。

---

## 本项目部署记录

| 项目 | 值 |
|------|-----|
| Worker 名称 | `gh-proxy` |
| Account ID | 在 Dashboard 获取 |
| 访问域名 | `your-domain.com` |
| 路由规则 | `your-domain.com/*` |
| Token | 在 Cloudflare Dashboard 设置 |
| 部署方式 | API 直接部署（body_part 格式） |
