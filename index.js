'use strict'

const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/'
const PREFIX = '/'
const Config = { jsdelivr: 0 }

// 部署前替换为你的 token，建议使用随机生成的长字符串
// 示例: const AUTH_TOKEN = 'your_random_token_here'
const AUTH_TOKEN = 'CHANGE_ME'
const PROXY_HEADER = 'X-Proxy-Token'

const whiteList = []

const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i

function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

function newUrl(urlStr) {
    try { return new URL(urlStr) } catch (err) { return null }
}

addEventListener('fetch', e => {
    const ret = fetchHandler(e).catch(err => makeRes('cfworker error:\n' + err.stack, 502))
    e.respondWith(ret)
})

function checkUrl(u) {
    for (let i of [exp1, exp2, exp3, exp4, exp5, exp6]) {
        if (u.search(i) === 0) return true
    }
    return false
}

function verifyToken(req, urlObj) {
    const queryToken = (urlObj.searchParams.get('token') || '').replace(/\/+$/, '')
    if (queryToken === AUTH_TOKEN) return true
    const proxyToken = req.headers.get(PROXY_HEADER)
    if (proxyToken === AUTH_TOKEN) return true
    const authHeader = req.headers.get('Authorization')
    if (authHeader && authHeader.replace(/^Bearer\s+/i, '') === AUTH_TOKEN) return true
    return false
}

async function fetchHandler(e) {
    const req = e.request
    const urlObj = new URL(req.url)

    if (req.method === 'OPTIONS' && req.headers.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT)
    }

    let path = urlObj.searchParams.get('q')
    if (path) {
        return Response.redirect('https://' + urlObj.host + PREFIX + path, 301)
    }

    path = urlObj.href.slice(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://')

    // Strip query string for root URL check (handles /?token=xxx)
    const pathOnly = path.split('?')[0].replace(/\/+$/, '')
    if (!pathOnly || pathOnly === '' || pathOnly === '/') {
        // Token verification endpoint
        const token = urlObj.searchParams.get('token')
        if (token) {
            if (verifyToken(req, urlObj)) {
                return makeRes('TOKEN_VALID', 200, { 'content-type': 'text/plain' })
            } else {
                return makeRes('TOKEN_INVALID', 403, { 'content-type': 'text/plain' })
            }
        }
        return makeRes(getInfoPage(urlObj.host), 200, { 'content-type': 'text/html; charset=utf-8' })
    }

    if (!verifyToken(req, urlObj)) {
        return makeRes('Unauthorized: Invalid token. Append ?token=YOUR_TOKEN to the URL.', 403)
    }

    urlObj.searchParams.delete('token')

    // Remove token from path (for query param auth)
    path = path.replace(/[?&]token=[^&]*/g, '').replace(/\?$/, '')

    // git client appends trailing '/' which breaks ?token parsing
    path = path.replace(/\/$/, '')

    if (path.search(exp1) === 0 || path.search(exp5) === 0 || path.search(exp6) === 0 || path.search(exp3) === 0) {
        return httpHandler(req, path)
    } else if (path.search(exp2) === 0) {
        if (Config.jsdelivr) {
            const newUrl = path.replace('/blob/', '@').replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh')
            return Response.redirect(newUrl, 302)
        } else {
            path = path.replace('/blob/', '/raw/')
            return httpHandler(req, path)
        }
    } else if (path.search(exp4) === 0) {
        if (Config.jsdelivr) {
            const newUrl = path.replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1').replace(/^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh')
            return Response.redirect(newUrl, 302)
        } else {
            return httpHandler(req, path)
        }
    } else {
        return fetch(ASSET_URL + path)
    }
}

function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers
    if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT)
    }
    const reqHdrNew = new Headers(reqHdrRaw)
    reqHdrNew.delete(PROXY_HEADER)
    let urlStr = pathname
    let flag = !Boolean(whiteList.length)
    for (let i of whiteList) {
        if (urlStr.includes(i)) { flag = true; break }
    }
    if (!flag) return new Response("blocked", { status: 403 })
    if (urlStr.search(/^https?:\/\//) !== 0) urlStr = 'https://' + urlStr
    const urlObj = newUrl(urlStr)
    const reqInit = { method: req.method, headers: reqHdrNew, redirect: 'manual', body: req.body }
    return proxy(urlObj, reqInit)
}

async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit)
    const resHdrOld = res.headers
    const resHdrNew = new Headers(resHdrOld)
    const status = res.status
    if (resHdrNew.has('location')) {
        let _location = resHdrNew.get('location')
        if (checkUrl(_location)) {
            resHdrNew.set('location', PREFIX + _location)
        } else {
            reqInit.redirect = 'follow'
            return proxy(newUrl(_location), reqInit)
        }
    }
    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')
    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')
    return new Response(res.body, { status, headers: resHdrNew })
}

function getInfoPage(host) {
    const PROXY_URL = `https://${host}`
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>GitHub 文件加速</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#333}.container{background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:40px;max-width:600px;width:100%}h1{text-align:center;color:#333;margin-bottom:10px;font-size:28px}.subtitle{text-align:center;color:#666;margin-bottom:30px;font-size:14px}.form-group{margin-bottom:20px}label{display:block;font-weight:600;margin-bottom:8px;color:#555;font-size:14px}input[type="text"]{width:100%;padding:12px 15px;border:2px solid #e1e5e9;border-radius:8px;font-size:14px;transition:border-color .3s}input[type="text"]:focus{outline:none;border-color:#667eea}.btn{width:100%;padding:14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 5px 20px rgba(102,126,234,.4)}.divider{height:1px;background:#e1e5e9;margin:30px 0}.section-title{font-size:16px;font-weight:600;color:#333;margin-bottom:15px;display:flex;align-items:center;gap:8px}.section-title::before{content:'';width:4px;height:18px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:2px}.example-list{list-style:none}.example-list li{padding:10px 12px;background:#f8f9fa;border-radius:6px;margin-bottom:8px;font-size:13px;word-break:break-all;cursor:pointer;transition:background .2s}.example-list li:hover{background:#e9ecef}.example-list li .label{color:#667eea;font-weight:600;margin-right:8px}code{font-family:"SF Mono",Monaco,monospace;color:#e83e8c;font-size:12px}.tips{background:#fff3cd;border-left:4px solid #ffc107;padding:12px 15px;border-radius:0 6px 6px 0;font-size:13px;color:#856404;margin-top:15px}.tips strong{display:block;margin-bottom:5px}.token-section{background:#f8f9fa;border-radius:8px;padding:15px;margin-top:20px}.token-section .section-title{margin-bottom:10px}.token-input-group{display:flex;gap:10px}.token-input-group input{flex:1}.token-input-group .btn{width:auto;padding:12px 24px}.result{margin-top:15px;padding:12px;background:#d4edda;border-radius:6px;font-size:13px;word-break:break-all;display:none}.result.show{display:block}footer{margin-top:30px;color:rgba(255,255,255,.8);font-size:13px;text-align:center}footer a{color:#fff;text-decoration:underline}</style></head><body><div class="container"><h1>🚀 GitHub 文件加速</h1><p class="subtitle">通过 Cloudflare Worker 加速 GitHub 文件下载</p><div class="form-group"><label>GitHub 文件链接</label><input type="text" id="github-url" placeholder="输入 GitHub 链接，如 https://github.com/user/repo/releases/download/v1.0/file.zip"></div><button class="btn" onclick="generateLink()">生成加速链接</button><div class="result" id="result"><strong>加速链接：</strong><a id="result-link" href="#" target="_blank"></a></div><div class="divider"></div><div class="section-title">使用示例</div><ul class="example-list"><li onclick="fillUrl(this)"><span class="label">Release 文件</span><code>https://github.com/user/repo/releases/download/v1.0/file.zip</code></li><li onclick="fillUrl(this)"><span class="label">分支源码</span><code>https://github.com/user/repo/archive/master.zip</code></li><li onclick="fillUrl(this)"><span class="label">文件内容</span><code>https://github.com/user/repo/blob/main/README.md</code></li><li onclick="fillUrl(this)"><span class="label">Raw 文件</span><code>https://raw.githubusercontent.com/user/repo/main/file.txt</code></li></ul><div class="divider"></div><div class="section-title">Git 操作</div><div class="example-list"><div class="tips"><strong>Git Clone 加速</strong><code>git clone ${PROXY_URL}/https://github.com/user/repo.git</code></div><div class="tips" style="margin-top:10px"><strong>Git Push（需要 GitHub PAT）</strong><code>git -c "http.extraHeader=X-Proxy-Token: TOKEN" -c "http.extraHeader=Authorization: Basic $(echo -n 'user:pat' | base64)" push</code></div></div><div class="divider"></div><div class="token-section"><div class="section-title">Token 验证</div><div class="token-input-group"><input type="text" id="token-input" placeholder="输入你的 Token"><button class="btn" onclick="verifyToken()">验证</button></div><div class="result" id="token-result"><strong id="token-result-text"></strong></div></div></div><footer><p>基于 <a href="https://github.com/hunshcn/gh-proxy">hunshcn/gh-proxy</a> 构建</p></footer><script>const PROXY_URL='${PROXY_URL}';function generateLink(){const url=document.getElementById('github-url').value.trim();if(!url)return;let githubUrl=url;if(githubUrl.startsWith(PROXY_URL))githubUrl=githubUrl.replace(PROXY_URL+'/','');if(!githubUrl.startsWith('http'))githubUrl='https://'+githubUrl;const token=document.getElementById('token-input').value.trim();const proxyLink=PROXY_URL+'/'+githubUrl+(token?'?token='+token:'');const resultDiv=document.getElementById('result');const resultLink=document.getElementById('result-link');resultLink.href=proxyLink;resultLink.textContent=proxyLink;resultDiv.classList.add('show')}function fillUrl(li){const code=li.querySelector('code');if(code){document.getElementById('github-url').value=code.textContent;generateLink()}}function verifyToken(){const token=document.getElementById('token-input').value.trim();if(!token)return;const resultDiv=document.getElementById('token-result');const resultText=document.getElementById('token-result-text');fetch(PROXY_URL+'/?token='+token).then(r=>{if(r.ok)return r.text();throw new Error('Invalid')}).then(text=>{if(text.trim()==='TOKEN_VALID'){resultText.textContent='✓ Token 有效';resultText.style.color='#155724';resultDiv.style.background='#d4edda'}else{resultText.textContent='✗ Token 无效';resultText.style.color='#721c24';resultDiv.style.background='#f8d7da'}resultDiv.classList.add('show')}).catch(()=>{resultText.textContent='✗ Token 无效';resultText.style.color='#721c24';resultDiv.style.background='#f8d7da';resultDiv.classList.add('show')})}document.getElementById('github-url').addEventListener('keypress',function(e){if(e.key==='Enter')generateLink()});document.getElementById('token-input').addEventListener('keypress',function(e){if(e.key==='Enter')verifyToken()})</script></body></html>`
}

function getSuccessPage(host) {
    return getInfoPage(host)
}
