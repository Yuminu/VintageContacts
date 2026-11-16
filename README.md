# VintageContacts · 纸间来电

按“复古红色转盘电话 + 纸质翻开记事簿”的设计实现的通讯录网站。前端使用原生 HTML / CSS / JavaScript，后端使用 Express 5 和 SQLite，联系人保存在服务器数据库中。

## 快速开始

需要 Node.js 24 LTS 或更高版本。

```sh
npm install
npm start
```

浏览器打开 <http://127.0.0.1:4173/>。首次启动会在 `data/contacts.sqlite` 中创建 8 位虚构示例联系人。

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` | `127.0.0.1` | 后端监听地址 |
| `PORT` | `4173` | 后端端口 |
| `DB_PATH` | `data/contacts.sqlite` | SQLite 文件位置 |
| `SEED_DEMO` | `true` | 首次初始化时是否写入示例联系人 |

示例：

```sh
PORT=8080 DB_PATH=/var/lib/vintagecontacts/contacts.sqlite npm start
```

## 架构

```text
Browser
   |
   v
Nginx (静态文件 + /api 反向代理)
   |
   v
Express 5 (127.0.0.1:4173)
   |
   v
SQLite (node:sqlite)
```

- `dist/`：前端页面、样式、前端数据逻辑和 SheetJS。
- `server/`：Express API、SQLite 数据层和校验。
- `tests/`：前端数据逻辑与后端 API 测试。
- `deploy/`：Nginx 和 systemd 配置。
- `scripts/`：部署与数据库备份脚本。
- `docs/`：部署说明和测试报告。

## 已实现的体验

- 桌面首页：右侧红色电话、左下方小记事簿、浅色桌面与纸张纹理。
- 转盘：拖动旋转，把数字对到右下角指针，停留 1 秒录入；支持直接点击数字、连续重复数字、键盘访问数字按钮。气泡也可直接编辑、退格和清空。
- 电话状态：输入时听筒悬起；满 11 位后静置 2 秒，响铃动画持续 1 秒，再打开对应详情或带预填号码的新建页。更改号码会重新计时。网站不会实际拨打电话。
- 记事簿目录：左页特别关心、拨号与搜索打开次数合计前五的联系人，右页搜索、姓名字母索引与分组入口。
- 联系人详情：左页备注，右页姓名、分组、多个电话、多个邮箱、多个社交账号和通讯地址。书签用于切换特别关心。姓名必填；电话号码允许 3–20 位数字，支持空格、括号、+ 和短横线格式化；跨联系人重复号码会阻止保存。
- 一个联系人可以保存多条电话、邮箱和社交账号，导入和导出时不会压缩成单一值。
- 收藏/特别关心状态保存到后端，刷新页面后仍然存在。
- 自动保存：编辑停顿 450 毫秒后保存；保存时先写入本机缓存，再同步到 `/api/contacts`。网络异常时页面继续使用本地缓存，并提示云端同步失败。
- 分组：自定义分组、新建、删除、筛选；删除分组不会删除联系人，会归入未分组。
- Excel：右下角铅笔提供导入、模板下载和完整导出。导入先预览结果，错误行列出原因，确认后才写入；导入后联系人同步到后端。
- 响应式：窄屏记事簿变为上下纸页，全部字段保持可访问；默认静音，可用右上角音符打开合成音效。

## 数据模型

SQLite 使用三张表：

- `contacts`：联系人主表，保存姓名、分组、短码、地址、备注、收藏、拨号/搜索次数和时间戳。
- `contact_methods`：联系方式表，保存 `phone`、`email`、`social` 三类方法和社交平台标签。
- `settings`：保存分组列表和初始化标记。

一个联系人对多条 `contact_methods`，删除联系人时关联记录级联删除。数据库字段使用 `snake_case`，API JSON 使用 `camelCase`。

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/healthz` | Nginx / 运维健康检查 |
| GET | `/api/contacts` | 获取联系人和分组 |
| PUT | `/api/contacts` | 批量同步联系人和分组（前端保存使用） |
| GET | `/api/contacts/:id` | 获取单个联系人 |
| POST | `/api/contacts` | 新增联系人 |
| PUT | `/api/contacts/:id` | 更新联系人 |
| DELETE | `/api/contacts/:id` | 删除联系人 |
| PATCH | `/api/contacts/:id/favorite` | 修改收藏状态 |

成功响应示例：

```json
{
  "success": true,
  "data": {},
  "message": "操作完成"
}
```

失败响应示例：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求数据不合法",
    "details": []
  }
}
```

## Excel 格式

使用第一张工作表，首行为列名：

| 姓名 | 分组 | 键盘短码 | 电话号码 | 电子邮箱 | 社交媒体账号 | 通讯地址 | 备注 | 特别关心 |
|---|---|---|---|---|---|---|---|---|
| 示例姓名 | 朋友 | 001 | 13800000000；13900000000 | hello@example.com | 微信:example；QQ:123456 | 城市和街道 | 一点小事 | 是 |

只有姓名是必需列。电话与邮箱用中英文分号或换行分隔；同一类型的多个值放在同一单元格。电话号码单元格请设为文本，以保留前导零；已经在 Excel 里丢失的零无法恢复。社交账号支持可读格式或本站导出的 JSON 数组。导出每位联系人占一行，所有单元格按文本写入，不执行公式。

导入按电话号码识别已有联系人：合并电话、邮箱、社交账号；导入的非空姓名、分组、地址和备注更新旧值；原有特别关心保留，导入“是”可以新增收藏。无电话的记录会作为新联系人。若同一行的号码命中不同联系人，跳过该行并提示手动核对。最多 5 MB / 5000 数据行。

Excel 解析在浏览器中使用 SheetJS 完成，导入确认后通过后端 API 保存联系人。选择这种方案是为了在导入前即时预览和逐行报错，同时保证最终数据写入 SQLite。

## 数据边界

- 正式数据保存在服务器 SQLite，同一 URL 的访问者共享同一份通讯录数据。
- localStorage 只作为本机缓存和网络异常时的兜底；页面加载时优先读取后端数据。
- 没有登录账户、多用户权限或跨服务器同步。
- 清理浏览器不会删除服务器数据；清理服务器数据库会删除所有联系人，请定期导出和备份。
- 首次打开提供 8 位虚构联系人；测试和演示时勿填真实个人隐私。

## 测试

```sh
npm test
```

测试使用 Node.js 内置 `node:test`，覆盖前端数据逻辑、Excel xlsx 往返、联系人 CRUD、收藏、批量同步、输入校验、静态资源和 SQLite 重启持久化。当前共 13 个测试，全部通过。详细记录见 [docs/test-report.md](docs/test-report.md)。

单独运行：

```sh
npm run test:data
npm run test:server
```

GitHub Actions 在 push 和 Pull Request 时执行 `npm ci` 与 `npm test`。

## 部署

部署方案见 [docs/deployment.md](docs/deployment.md)。计划使用腾讯云 Lighthouse（Ubuntu 24.04）、Nginx、systemd 和 Node.js 24 LTS。

云部署地址：待部署完成后填写。当前不能把本地 `localhost` 当作云部署完成。

## 代码规范

见 [CODE_STYLE.md](CODE_STYLE.md)。

## 团队与分工

最终提交前根据实际协作情况补充。当前代码贡献和 PR 记录以 GitHub 仓库为准，不提前填写比例。

## 第三方库

`dist/vendor/xlsx.full.min.js` 为 SheetJS Community Edition 0.20.3，Apache-2.0 许可，许可见 `THIRD_PARTY_LICENSES.md`。库随站点打包，不依赖运行时 CDN。

## 说明

本项目是软件工程课程作业的应用实现。云部署、个人博客、演示视频和贡献比例在最终提交前按实际情况补充，不虚构测试结果或部署状态。
