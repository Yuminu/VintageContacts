# 代码规范

本项目的代码规范用于前后端协作、Code Review 和课程作业提交。新增代码应尽量与现有风格一致。

## 语言与运行环境

- JavaScript（ES2022）与 ES Modules，不使用 TypeScript。
- Node.js 24 LTS。
- 前端不使用打包工具，`dist/` 中的文件就是运行文件。
- 后端使用 Express 5，数据库使用 Node.js 内置 `node:sqlite`。
- 不引入与当前需求无关的框架或大型依赖。

## 命名

- 变量、函数、参数使用 `camelCase`。
- 常量使用 `UPPER_SNAKE_CASE`。
- 数据库字段使用 `snake_case`，API JSON 使用 `camelCase`。
- API 路径使用小写英文和短横线，例如 `/api/contacts/:id/favorite`。
- 文件名使用小写英文；前端文件保持 `app.js`、`data.js` 等现有命名。

## 格式

- 使用 2 个空格缩进；服务端代码保持一行一个语句。
- 字符串优先使用单引号；模板字符串用于拼接。
- 语句结尾保留分号。
- 不提交调试输出、临时文件、真实联系人数据或密钥。
- 注释只解释不明显的设计原因，不重复代码表面含义。

## API 与数据

- 成功响应：`{ "success": true, "data": ..., "message": "..." }`。
- 失败响应：`{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`。
- 联系人主键使用字符串 UUID；数据库生成时间戳，前端不伪造。
- 一个联系人可以有多条电话、邮箱和社交账号，数据库使用 `contact_methods` 关联表。
- 修改 API 路径、字段名或响应结构前，先与另一位组员确认。

## Git 提交

提交信息使用“类型: 简短说明”的格式：

```text
feat: add Express and SQLite backend
fix: handle invalid speed code during sync
test: cover contact CRUD and persistence
docs: add deployment and test reports
chore: prepare production server config
```

每次提交应只包含一个可解释的改动，不提交空提交或无关文件。

## 安全

- 不把 `.env`、数据库文件、上传文件、日志或 SSH 私钥提交到仓库。
- 用户输入必须校验长度和类型；数据库写入使用参数绑定。
- 不在日志中输出完整联系人或密钥。
- 生产环境的 SQLite 文件放在代码目录之外，并定期备份。
