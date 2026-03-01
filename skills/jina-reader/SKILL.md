---
name: jina-reader
description: "抓取网页内容并转换为干净的 Markdown 格式。使用场景：需要读取网页全文内容、绕过付费墙、抓取推特内容、获取结构化元数据。优势：支持 JavaScript 渲染、能绕过付费墙、支持推特、返回 AI 友好的 Markdown、免费无需 API key。"
homepage: https://jina.ai/reader/
metadata: { "openclaw": { "emoji": "🕷️", "requires": { "bins": ["curl"] } } }
---

# Jina.ai Reader Skill

高级网页内容抓取工具，专为 AI 优化。

## 核心优势

✅ **能绕过付费墙** - 测试过 Every.to 的登录墙文章，直接拿到完整内容
✅ **支持 JavaScript 渲染** - 不像 Readability 那样只能抓静态 HTML
✅ **能抓取推特** - 很多工具搞不定 X.com，它可以
✅ **干净的 Markdown 输出** - AI 读起来很舒服
✅ **免费，无需 API key** - 直接用
✅ **结构化元数据** - 包含标题、作者、发布时间等信息

## 使用方法

### 基础用法

在任何网址前面加上 `https://r.jina.ai/` 前缀：

```bash
# 原始网址
https://example.com/article

# 转换为 Jina Reader URL
curl https://r.jina.ai/https://example.com/article
```

### 实际例子

```bash
# 抓取普通网页
curl https://r.jina.ai/https://every.to/nothing-to-read/late-capitalism

# 抓取推特
curl https://r.jina.ai/https://x.com/elonmusk/status/1234567890

# 抓取新闻文章
curl https://r.jina.ai/https://www.bbc.com/news/article
```

## 何时使用

### ✅ 应该用 Jina Reader：

- 需要读取网页的完整文章内容
- 网站有付费墙或需要登录
- 抓取推特内容
- 需要结构化的元数据（标题、作者、时间）
- 网页需要 JavaScript 才能显示内容
- 要把网页内容给 AI 处理

### ❌ 不应该用 Jina Reader：

- 只需要网页的简单摘要 → 用 `web_fetch` 就够了
- 网页是动态交互式应用（如 SPA）→ 可能效果不好
- 需要保持登录状态的私人内容 → Jina 只能抓公开内容
- 网页有反爬虫机制 → 可能被拦截

## 输出格式

Jina Reader 返回干净的 Markdown 格式，包含：

```markdown
Title: 文章标题
URL Source: https://original-url.com
Published: 2024-01-15
Author: 作者名字

[文章正文内容...]

# 标题 1

正文...

## 标题 2

正文...
```

## 高级选项

### 只获取前 N 个字符

```bash
# 只抓前 5000 字符（节省 token）
curl https://r.jina.ai/https://example.com/article | head -c 5000
```

### 批量抓取

```bash
# 抓取多个链接
for url in "url1" "url2" "url3"; do
  echo "=== $url ==="
  curl "https://r.jina.ai/$url"
  echo -e "\n"
done
```

## 与 OpenClaw 集成

在对话中，当用户说：

- "帮我读一下这个网页"
- "抓取这个链接的内容"
- "看看这篇文章说了什么"
- "这个推特说了什么"

→ 使用 `exec` 工具调用 `curl https://r.jina.ai/<URL>`

## 对比其他工具

| 工具               | JS 渲染 | 付费墙 | 推特 | Markdown | 免费 |
| ------------------ | ------- | ------ | ---- | -------- | ---- |
| **Jina Reader**    | ✅      | ✅     | ✅   | ✅       | ✅   |
| OpenClaw web_fetch | ❌      | ❌     | ❌   | ✅       | ✅   |
| Puppeteer          | ✅      | ❌     | ✅   | ❌       | ✅   |

## 限制

- 免费版有速率限制（不要疯狂请求）
- 某些网站可能拦截 Jina 的 IP
- 不能抓取需要账号登录的私人内容
- 非常复杂的单页应用可能抓取不完整

## 故障排除

**返回空白内容：**

- 网站可能拦截了爬虫
- 尝试等待几分钟后重试

**格式混乱：**

- 某些网站的 HTML 结构不标准
- 可以尝试用 `pandoc` 等工具二次处理

**找不到内容：**

- 可能是动态加载的内容，Jina 也没能抓到
- 考虑用浏览器自动化工具

## 示例场景

**场景 1：阅读付费文章**

```bash
curl https://r.jina.ai/https://every.to/nothing-to-read/late-capitalism
```

**场景 2：抓取推特讨论**

```bash
curl https://r.jina.ai/https://x.com/naval/status/1234567890
```

**场景 3：批量获取文章内容**

```bash
curl https://r.jina.ai/https://example.com/article1 > article1.md
curl https://r.jina.ai/https://example.com/article2 > article2.md
```

---

**提示：** 记住格式是 `https://r.jina.ai/` + `原始URL`，就这么简单！
