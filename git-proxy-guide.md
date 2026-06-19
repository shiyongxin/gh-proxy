# Git 通过 gh-proxy 推送到 GitHub 指南

## 概述

通过 Cloudflare Worker 代理（your-domain.com）实现 git 操作，解决无法直接访问 GitHub 的问题。

---

## 前置条件

1. **Proxy Token**：代理服务的认证 token（`AUTH_TOKEN`）
2. **GitHub PAT**：GitHub Personal Access Token，需勾选 `repo` 权限
3. **代理地址**：`https://your-domain.com`

---

## 配置步骤

### 1. 设置 Remote URL（不带 token）

```bash
git remote set-url origin "https://your-domain.com/https://github.com/<用户名>/<仓库名>.git"
```

### 2. 推送时传递认证 Header

```bash
# 将 GitHub PAT 编码为 Basic Auth
BASIC_AUTH=$(echo -n "<GitHub用户名>:<GitHub_PAT>" | base64)

git -c "http.extraHeader=X-Proxy-Token: <PROXY_TOKEN>" \
    -c "http.extraHeader=Authorization: Basic $BASIC_AUTH" \
    push -u origin master
```

### 3. 或者写入本地 Git Config

```bash
# 清理旧配置
git config --local --unset-all http.extraHeader 2>/dev/null

# 设置两个 header
git config --local http.extraHeader "X-Proxy-Token: <PROXY_TOKEN>"
git config --add --local http.extraHeader "Authorization: Basic <base64编码>"

# 之后直接 push
git push -u origin master
```

**完成后清理敏感信息：**
```bash
git config --local --unset-all http.extraHeader
```

---

## 为什么需要两个 Header？

| Header | 用途 | 接收方 |
|--------|------|--------|
| `X-Proxy-Token` | 代理服务认证 | Proxy（验证后删除） |
| `Authorization: Basic` | GitHub 仓库认证 | GitHub（Proxy 透传） |

### 认证流程

```
Git Client
  │
  ├── X-Proxy-Token: <PROXY_TOKEN>     ──→  Proxy 验证
  ├── Authorization: Basic <PAT>        ──→  Proxy 透传给 GitHub
  │
  ▼
Proxy (your-domain.com)
  │
  ├── 删除 X-Proxy-Token
  ├── 保留 Authorization
  │
  ▼
GitHub
  └── 验证 Basic Auth → 允许 push
```

---

## 为什么不能用 URL 带 token？

Git 会在 remote URL 后追加路径（如 `/info/refs?service=git-receive-pack`），导致 token 被破坏：

```
# 设置的 URL
https://your-domain.com/https://github.com/user/repo.git?token=XXX

# Git 实际请求的 URL
https://your-domain.com/https://github.com/user/repo.git?token=XXX/info/refs&service=git-receive-pack
                                                 ↑ token 被截断，包含路径片段
```

Proxy 解析到的 token 变成 `XXX/info/refs`，验证失败返回 403。

---

## 为什么 GitHub PAT 用 Basic Auth 而不是 Bearer？

GitHub 的 Git 端点（`/info/refs`、`/git-receive-pack`）只接受 Basic Auth，不接受 Bearer Token：

```bash
# ✗ Bearer Token — 返回 401
curl -H "Authorization: Bearer ghp_xxx" "https://github.com/user/repo.git/info/refs?service=git-receive-pack"

# ✓ Basic Auth — 返回 200
curl -u "username:ghp_xxx" "https://github.com/user/repo.git/info/refs?service=git-receive-pack"
```

编码方式：
```bash
echo -n "username:ghp_xxx" | base64
# 输出：dXNlcm5hbWU6Z2hwX3h4eA==
# Header: Authorization: Basic dXNlcm5hbWU6Z2hwX3h4eA==
```

---

## Proxy 代码关键改动

### 1. 去除 Git 尾部 `/`（解决 token 解析问题）

```javascript
// fetchHandler 中，解析 URL 前去除尾部 /
urlStr = urlStr.replace(/\/(?=\?|$)/, '')
```

### 2. 支持 X-Proxy-Token Header 认证

```javascript
function verifyToken(req, urlObj) {
    const queryToken = urlObj.searchParams.get('token')
    if (queryToken === AUTH_TOKEN) return true
    const proxyToken = req.headers.get('X-Proxy-Token')   // 新增
    if (proxyToken === AUTH_TOKEN) return true              // 新增
    const authHeader = req.headers.get('Authorization')
    if (authHeader && authHeader.replace(/^Bearer\s+/i, '') === AUTH_TOKEN) return true
    return false
}
```

### 3. 转发时删除 Proxy Token，保留 GitHub 认证

```javascript
function httpHandler(req, pathname) {
    const reqHdrNew = new Headers(reqHdrRaw)
    reqHdrNew.delete('X-Proxy-Token')  // 删除 proxy 认证
    // Authorization 保留，透传给 GitHub
    ...
}
```

### 4. 清除 Path 中残留的 Token

```javascript
path = path.replace(/[?&]token=[^&]*/g, '').replace(/\?$/, '')
```

---

## 常用命令速查

```bash
# 克隆（仅 proxy token，无需 GitHub 认证）
git -c "http.extraHeader=X-Proxy-Token: <PROXY_TOKEN>" \
    clone https://your-domain.com/https://github.com/user/repo.git

# 推送（需要 proxy token + GitHub PAT）
BASIC_AUTH=$(echo -n "username:<PAT>" | base64)
git -c "http.extraHeader=X-Proxy-Token: <PROXY_TOKEN>" \
    -c "http.extraHeader=Authorization: Basic $BASIC_AUTH" \
    push -u origin master

# 拉取（仅 proxy token）
git -c "http.extraHeader=X-Proxy-Token: <PROXY_TOKEN>" \
    pull origin master
```

---

## 浏览器使用

浏览器下载文件直接在 URL 后加 `?token=<PROXY_TOKEN>`：

```
https://your-domain.com/https://github.com/user/repo/releases/download/v1.0/file.zip?token=<PROXY_TOKEN>
```

---

## 故障排查

| 状态码 | 原因 | 解决方案 |
|--------|------|----------|
| 403 | Proxy token 无效 | 检查 X-Proxy-Token 或 URL 中的 token |
| 401 | GitHub 认证失败 | 检查 PAT 权限，确认使用 Basic Auth |
| 404 | 仓库不存在 | 确认 GitHub 仓库已创建 |
| 400 | 请求格式错误 | 检查 header 格式，特别是 Basic Auth 编码 |
