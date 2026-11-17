# 极限编程作业提交清单

课程：2601_FZU-MU_SE。作业要求见[老师的作业帖](https://bbs.csdn.net/topics/620593436)。截止时间为 **2026 年 11 月 17 日 23:59（北京时间）**。

本清单用于核对材料，不证明尚未完成的协作、发布或个人记录已经完成。

## 仓库内可核验的内容

| 要求 | 核验入口 |
|---|---|
| 联系人收藏 | `dist/app.js` 的特别关心书签和收藏列表，状态保存到 SQLite |
| 多种联系方式 | 联系人详情的多电话、多邮箱、多社交账号，以及 `server/db.js` 的 `contact_methods` |
| Excel 导入导出 | 记事簿铅笔入口；`dist/data.js` 的导入合并与导出映射 |
| 后端与数据库 | `server/`：Express 5、SQLite、版本号同步、服务端唯一性校验 |
| 可用界面 | `dist/index.html`、`dist/styles.css`；浏览器实际运行 |
| 可复现运行 | [README](../README.md)：`npm install && npm start`（Node.js 24） |
| 代码规范 | [CODE_STYLE.md](../CODE_STYLE.md) |
| 自动测试 | `npm test`；当前 25 项通过，测试内容见 `tests/` |
| 至少 3 次提交 | [GitHub 提交历史](https://github.com/Yuminu/VintageContacts/commits/main/)；以远端实际记录为准 |
| 项目版本发布 | [Releases](https://github.com/Yuminu/VintageContacts/releases)；核对版本及其代码提交 |
| 发起 Pull Request | [Pull Requests](https://github.com/Yuminu/VintageContacts/pulls?q=is%3Apr)；核对 PR 的改动、分支和状态 |

Release 和 PR 以 GitHub 实际返回的记录为准，不能只凭本清单勾选完成。

## 两位同学需要各自确认

- [ ] 核对老师指定的上游仓库，并按要求完成 Fork 和团队仓库设置；当前材料未证明 Fork 要求已满足。
- [ ] 两位同学均有实际编码贡献，使用各自真实身份提交；仓库已有多次提交不等于两人都已贡献。
- [ ] 保存提交历史截图，并分别统计成员的提交次数；可用 `git shortlog -sne --all` 辅助核对，不以提交次数单独判断工作量。
- [ ] 依据实际过程填写模块分工、各自遇到的问题和解决办法。
- [ ] 根据真实工作评估贡献比例，合计 100%；不得仅为满足格式虚写 50% / 50%。
- [ ] 每人填写自己的 PSP 表，记录各环节预计时间与实际时间，不补造用时。

## 每人的 CSDN 博客

两人可共同准备 Markdown 文稿，但必须由各自账号分别发布，并提交自己的已发布博客链接。

- [ ] 使用 Markdown，包含目录和开头信息表。
- [ ] 放入仓库链接、代码规范链接、作业要求链接和相关参考资料。
- [ ] 说明必需功能的实现思路，提供程序截图和完整演示视频。
- [ ] 提供 Git 提交历史截图、各成员提交次数、分工、贡献比例、协作问题与解决方法，以及两人的 PSP 表。
- [ ] 如申请云部署加分，提供老师可公开访问并实际使用的云服务器地址；本机 `localhost` 不算，私有访问或被拦截的地址不能替代可用公网演示。
- [ ] 检查博客、视频、仓库权限与全部链接，确保老师能够核验。
- [ ] 提前发布以预留审核时间，再到作业页点击“提交任务”，填入自己的博客链接并确认提交。

博客开头可用以下信息表，团队名称由你们填写：

| 项目 | 内容 |
|---|---|
| 本次作业所属课程 | 2601_FZU-MU_SE |
| 团队名称 | 待填写真实团队名称 |
| 作业要求 | [极限编程作业](https://bbs.csdn.net/topics/620593436) |
| 本次作业目标 | 实现通讯录功能，实践结对协作、Git 和软件工程方法 |
| 其他参考资料 | 按实际使用的资料填写 |

可直接使用的项目链接：[仓库](https://github.com/Yuminu/VintageContacts)、[代码规范](https://github.com/Yuminu/VintageContacts/blob/main/CODE_STYLE.md)。发布博客前仍需确认链接指向的版本已上传。

云部署地址：<http://101.34.73.63:8080/>。服务器 80 端口旧站保留，未修改旧站配置。

