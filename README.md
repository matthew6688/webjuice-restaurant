# WebJuice Stack MVP

B2B 公司官网批量生产模板。Astro + Cloudflare，无数据库、无 WordPress、一键创建新客户站。

---

## 核心特性

- **批量复制**：一键生成新客户的独立 repo + Pages 项目 + 域名绑定
- **品牌配置化**：所有客户信息集中在 `src/config/site.ts`，一键替换
- **零月费**：Cloudflare Pages + Resend 免费额度完全够用
- **全自动部署**：GitHub Actions + Wrangler，无需 Dashboard 点击

---



---

## 设计规范（强制）

所有 WebJuice 网站设计必须遵循 **webjuice-design** skill，基于 huashu-design + open-design。

核心要求：
- 事实验证先于假设（涉及具体品牌/产品时必须 WebSearch）
- 品牌资产协议：Logo > 产品图 > UI 截图 > 色值 > 字体
- 反 AI slop：禁止紫色渐变、Emoji 图标、SVG 手画代替真实产品图
- Junior Designer 模式：先展示假设，等确认后再执行

详见：
- huashu-design: https://github.com/alchaincyf/huashu-design/blob/main/SKILL.md
- open-design: https://github.com/nexu-io/open-design/tree/main/skills

---
## 技术架构

| 层级 | 技术 | 用途 | 费用 |
|------|------|------|------|
| 前端 | Astro + Tailwind | 静态站点 | $0 |
| 内容 | Content Collections | Markdown 博客/案例 | $0 |
| 托管 | Cloudflare Pages | 构建+部署+CDN | $0 |
| 表单 | Pages Functions | 联系表单 | $0 |
| 邮件发送 | Resend | 表单通知 | $0 (3000封/月) |
| 邮件接收 | Cloudflare Email Routing | 转发 | $0 |
| CI/CD | GitHub Actions + Wrangler | 自动部署 | $0 |

**总月费：$0**

---

## 快速开始

### 1. 克隆模板

```bash
git clone https://github.com/matthewatuchat/webjuice-stack-mvp.git
cd webjuice-stack-mvp
npm install
npm run dev
```

浏览器打开 `http://localhost:4321`。

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 token：

```bash
# GitHub Personal Access Token (需要 repo 和 workflow 权限)
GH_PAT=github_pat_xxx

# Cloudflare API Token (需要 Account:Read, Pages:Edit, DNS:Edit)
CF_API_TOKEN=xxx
CF_ACCOUNT_ID=2b67d2288df946ac22f408b60a9bcc11

# Resend (用于客户邮件域名升级，可选)
RESEND_MASTER_KEY=re_xxx
```

### 3. 把此 repo 设为 GitHub Template

进入 [repo Settings](https://github.com/matthewatuchat/webjuice-stack-mvp/settings) → General → 勾选 **Template repository**。

这是一次性设置，之后所有新客户站都从这个模板生成。

---

## 一键创建新客户站

```bash
node scripts/new-client.js \
  --name "Acme Corp" \
  --slug acme-website \
  --domain acme.com \
  --email hello@acme.com
```

脚本会自动完成：
1. 从模板生成新 GitHub repo
2. 替换 `src/config/site.ts` 中的品牌信息
3. 创建 Cloudflare Pages 项目
4. 添加客户自定义域名
5. 设置 GitHub Actions 变量

**唯一需要手动的步骤**：在新 repo 的 Settings → Secrets 中添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。

### 输出示例

```
Repository: https://github.com/matthewatuchat/acme-website
Pages URL:  https://acme-website.pages.dev
Custom Domain: acme.com

⚠️  Manual steps required:
  1. Go to https://github.com/matthewatuchat/acme-website/settings/secrets/actions
     - Add CLOUDFLARE_API_TOKEN
     - Add CLOUDFLARE_ACCOUNT_ID
  2. Tell client to set this DNS record:
     acme.com  CNAME  acme-website.pages.dev
  3. Push any change to main branch to trigger first deploy
```

push 后 GitHub Actions 自动构建并部署到 Cloudflare Pages。

---

## 邮件架构

### Phase 1 — 默认上线（零配置）

所有客户站默认用你的域名发件：

```
发件人：WebJuice <hello@fengtalk.ai>
收件人：客户指定的通知邮箱
reply_to：网站访客填写的邮箱
```

### Phase 2 — 客户品牌升级

客户想用自己域名发件：

```bash
node scripts/upgrade-client-email.js client.com
```

自动完成：Resend 添加域名 → Cloudflare DNS 设置 → 创建 scoped API Key → 输出新配置。

---

## 目录结构

```
/
├── .github/workflows/
│   └── deploy.yml           # GitHub Actions + Wrangler 自动部署
├── functions/api/
│   └── contact.ts           # 表单处理 (Resend)
├── scripts/
│   ├── new-client.js        # 一键创建新客户站
│   ├── add-domain.js        # 域名上线
│   └── upgrade-client-email.js # 邮件域名升级
├── src/
│   ├── config/
│   │   └── site.ts          # 品牌配置（一键替换）
│   ├── content/
│   ├── layouts/
│   └── pages/
├── .env.example
├── astro.config.mjs
├── package.json
├── wrangler.toml
└── tsconfig.json
```

---

## 开发命令

```bash
npm install
npm run dev      # localhost:4321
npm run build    # 输出到 dist/
npm run preview
```

---

## 完整工作流

```
你的模板 repo (webjuice-stack-mvp)
           |
           v
node scripts/new-client.js --name "Acme" --slug acme --domain acme.com
           |
           v
    +------+------+
    |             |
    v             v
GitHub repo   Pages 项目
(acme-website)  (acme-website)
    |             |
    v             v
更改推送     自动部署
    |             |
    +------+------+
           |
           v
    https://acme-website.pages.dev
           |
           v
    客户设 CNAME → https://acme.com
```

---

## 待完成

- [ ] 在 GitHub 设置中勾选 "Template repository"
- [ ] 本地测试 `npm run dev`
- [ ] 创建第一个测试客户站验证流程
- [ ] 添加 `@tailwindcss/typography` 优化文章排版
- [ ] 添加 SEO 组件（sitemap、robots、meta tags）
- [ ] 接入 AI agent 内容生成
