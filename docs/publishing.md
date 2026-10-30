# 发布与收录指南

目标：让别人能 `dsh plugin add dsh-plugin-star-radar` 装上，并且在插件市场里搜得到。

DSH **没有官方插件市场**（官方 `plugin-market` bundle 的 README 写得很清楚：「Discover 只列出用户自己添加的索引源」）。所以「上架」实际上是**进社区索引**，主要就是 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 这一个——它同时提供 `plugins.json`，也正是本插件的数据源。

## 当前收录状态（2026-10-30）

| 项 | 状态 |
| --- | --- |
| awesome PR | [#9928](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9928) 已于 **2026-10-28 20:21 合并**（合并后被 close 属正常） |
| 条目文件 | `data/plugins/Moon-Cold-Sir__dsh-plugin-star-radar.yml`，维护者按实现把措辞调成「排名下滑后仍保留 180 天」，与本文件模板一致 |
| 站点索引 | `plugins.json` 于 **2026-10-29** 重建收录，`npm` 字段已自动关联；`version`/`downloads` 是抓取快照，会滞后于 npm |
| npm | `dsh-plugin-star-radar@3.2.0`，`latest` 已指向 |
| 安装命令 | `dsh plugin --profile web add dsh-plugin-star-radar` |

发新版只需要 `npm publish`；条目本身不用改（除非换仓库名、分类或描述）。站点下次重建后，索引里的版本号会自动跟上。


---

## 0. 发布前检查

```bash
# 包名是否可用（404 = 可用）
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/dsh-plugin-star-radar

# 清单是否合法
node --check lib/index.js && node --check lib/client.js
node --test "test/*.test.mjs"

# 打包预览：确认 files 里该有的都在
npm pack --dry-run
```

必须补齐的字段（现在是占位符）：

| 字段 | 现状 | 要改成 |
| --- | --- | --- |
| `author` | `TODO: your name <you@example.com>` | 你的名字 + 邮箱 |
| `repository` | `TODO-Moon-Cold-Sir` | 真实的 GitHub 仓库地址 |
| `homepage` / `bugs` | 同上 | 真实地址 |

`repository` 很重要：npm 包和 GitHub 仓库的对应关系是**按这个字段自动建立**的，索引站也据此把「仓库」和「npm 包」连起来。

另外确认：

- `LICENSE` 里的版权人改成你自己；
- `package.json` 的 `files` 里包含 `lib`、`locale`、`icon.svg`、`cordis.patch.yml`（已配好）；
- 仓库根目录的 `package.json` 声明了 `dsh.bundle.patch`（已配好，这是「可安装」的前提，只有 `dsh.client` 不算）。

---

## 1. 发到 npm

```bash
npm login                      # 浏览器授权
npm publish --access public    # 普通包名不需要 --access public，scoped 包才需要

# 验证
npm view dsh-plugin-star-radar version
dsh plugin --profile web add dsh-plugin-star-radar
```

发版后建议在**干净的 profile** 里装一次验证入口是否出现（`dsh plugin --profile test add ...`），别只在自己的开发 profile 里试。

> 如果包名被占用（`403 Forbidden - PUT`），换一个名字，并同步改：`package.json.name`、`cordis.patch.yml` 的 `name:`、`lib/client.src.js` 里 `__ModuleLoader__.load({ id })`、`lib/service.js` 的 `PACKAGE_NAME`、以及全部文档。

---

## 2. 进 awesome-dsh-plugin（市场搜得到的关键一步）

仓库：[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

索引数据在 `data/plugins/`，**一个插件一个 YAML 文件**，命名规则 `<owner>__<repo>.yml`（owner 是你的 GitHub 用户名，repo 是仓库名）：

```
data/plugins/Moon-Cold-Sir__dsh-plugin-star-radar.yml
```

内容：

```yaml
url: https://github.com/Moon-Cold-Sir/dsh-plugin-star-radar
name: Moon-Cold-Sir/dsh-plugin-star-radar
category: market
description:
  en: Star-ranked radar for DSH plugins. A plugin is listed at 3,000+ GitHub stars or 100k+ npm downloads in 30 days, and stays listed after its rank drops.
  zh: 按 GitHub 收藏数排名的 DSH 插件热度榜；收藏 ≥ 3,000 或近 30 天下载 ≥ 10 万即收录，排名下滑也不会被移出。
# 可选：市场卡片图标（GitHub 托管的位图；插件自身仍用 icon.svg）
icon: https://raw.githubusercontent.com/Moon-Cold-Sir/dsh-plugin-star-radar/main/docs/icon-180.png
```

字段以 `data/plugins/` 里已有条目为准，提交前对照仓库的 `contributing.md`。`category` 从索引的固定集合里选：

```
agi · ui · usage · theme · model · identity · session · memory · tools · wsl
browser · vision · voice · docs · skill · workflow · git · notify · dev
security · remote · market · fun
```

本插件建议 `market`（插件市场与管理）或 `ui`。

PR 要点：

- **一个 PR 只加自己的条目**，不要顺手改别人的行；
- 生成的 README 不要手改（CI 会重新生成）；
- 仓库加 GitHub topic `dsh-plugin`（很多生态工具按 topic 发现项目）；
- 合并后站点会自动重建，`plugins.json` 里出现你的条目，**本插件下一轮刷新就会把你自己也统计进去**（这也是为什么必须发 npm：没有 npm 包就没有下载量，只有 stars 能让你上榜）。

### 没有 npm 包怎么办

把打包好的 `dsh-plugin-star-radar-3.0.0.tgz` 挂到 GitHub Release，然后在条目里加：

```yaml
tarball: https://github.com/Moon-Cold-Sir/dsh-plugin-star-radar/releases/latest/download/dsh-plugin-star-radar.tgz
```

注意 `latest/download/` 只解析 `latest`，**文件名必须不含版本号**，否则你发下一版它就 404 了。更稳的做法是钉死 tag：

```yaml
tarball: https://github.com/Moon-Cold-Sir/dsh-plugin-star-radar/releases/download/v3.0.0/dsh-plugin-star-radar-3.0.0.tgz
```

---

## 3. （可选）dshbase 实测

[dshbase](https://dshbase.com/zh/audit/) 会做四级验证：L1 安装 → L2 加载 → L3 headless → L4 Web CDP，通过的会标「已验证」。它按 npm/GitHub 元数据自动收录，通常不需要手动提交；如果希望加快，按站点说明提 issue。

---

## 4. 发布检查清单

- [ ] `package.json`：`name` / `author` / `repository` / `homepage` / `bugs` 都是真实的
- [ ] `npm pack --dry-run` 里能看到 `lib/`、`locale/`、`icon.svg`、`cordis.patch.yml`
- [ ] `npm publish` 成功，`npm view <pkg> version` 能看到新版本
- [ ] 干净 profile 里 `dsh plugin add` 能装、能出入口、能出榜单
- [ ] awesome-dsh-plugin PR 已合并，站点搜索能搜到
- [ ] 等一轮刷新后，本插件能把自己也收录进去（star 或下载达门槛）

---

## 常见坑

| 现象 | 原因 / 处理 |
| --- | --- |
| `403 Forbidden - PUT` | 包名被占用，或没登录 / 没开 2FA |
| 装上了但设置里没有入口 | 宿主端代码改动需要**重启 DSH**；确认 bundle 在 `dsh.profile.bundles` 里且启用 |
| 市场搜不到 | 只发了 npm，没提 awesome PR；或 PR 未合并、索引尚未重建 |
| `engines.dsh` 写了却装不上 | 预发布版本的 semver 规则：`>=0.2.0-rc.1 <0.3.0-0` **匹配不到** `0.2.1-rc.3`，要显式加分支 `|| >=0.2.1-0 <0.3.0-0` |
| 仓库路径含中文，pnpm 写进 package.json 变成乱码 | 发布前把仓库放到纯 ASCII 路径下，或在 profile 里用 npm 包名而不是 `file:` 路径 |
| 页面很长 | 阈值太低：`minStars` 调到 3000 时收录约 28 个；调到 1000 会变成 40+ |
