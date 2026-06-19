# GitHub 文件加速代理

基于 Cloudflare Worker 的 GitHub 文件加速代理，支持 release 下载、文件访问、git clone/push 等操作。

## 功能特性

- ✅ Release 文件下载加速
- ✅ 分支源码下载加速
- ✅ 文件内容访问加速
- ✅ Git Clone 加速
- ✅ Git Push 支持（需要 GitHub PAT）
- ✅ Token 认证保护
- ✅ 交互式使用页面

## 快速开始

### 1. 配置 Token

编辑 `index.js`，替换 `AUTH_TOKEN` 为你的自定义 token：

```javascript
const AUTH_TOKEN = 'your_random_token_here'
```

建议使用随机生成的长字符串，可以使用以下命令生成：

```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

### 2. 部署到 Cloudflare Worker

参考 [deploy.md](deploy.md) 获取详细部署指南。

**快速部署命令：**

```bash
ACCOUNT_ID="your_account_id"
API_TOKEN="your_api_token"
WORKER_NAME="gh-proxy"

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -F 'index.js=@index.js;type=application/javascript' \
  -F 'metadata={"body_part":"index.js"};type=application/json'
```

### 3. 绑定自定义域名（可选）

在 Cloudflare Dashboard 中配置 Worker 路由，将域名指向 Worker。

## 使用方法

### 浏览器下载

在 GitHub 链接前加上代理地址和 token：

```
https://your-domain.com/https://github.com/user/repo/releases/download/v1.0/file.zip?token=YOUR_TOKEN
```

### Git Clone

```bash
git -c "http.extraHeader=X-Proxy-Token: YOUR_TOKEN" \
    clone https://your-domain.com/https://github.com/user/repo.git
```

### Git Push

需要 GitHub Personal Access Token：

```bash
BASIC_AUTH=$(echo -n "username:github_pat" | base64)

git -c "http.extraHeader=X-Proxy-Token: YOUR_TOKEN" \
    -c "http.extraHeader=Authorization: Basic $BASIC_AUTH" \
    push -u origin master
```

## 文档

- [部署指南](deploy.md) - Cloudflare Worker 部署详细步骤
- [Git 代理使用指南](git-proxy-guide.md) - Git 操作通过代理的完整说明

## 许可证

基于 [hunshcn/gh-proxy](https://github.com/hunshcn/gh-proxy) 构建。
