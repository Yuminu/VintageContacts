# 部署文档

> 当前状态：已完成服务器信息和方案确认，尚未登录执行部署。实际公网访问地址、截图和最终版本在部署完成后补充，不提前填写。

## 1. 目标服务器

| 项目 | 值 |
|---|---|
| 云服务 | 腾讯云 Lighthouse |
| 公网 IP | `101.34.73.63` |
| 操作系统 | Ubuntu 22.04 |
| SSH 用户 | `ubuntu` |
| 已占用端口 | 80（已有 “Front-End / Back-End Calculator” 站点） |
| 本项目端口 | 8080（Nginx），后端 127.0.0.1:4173 |

80 端口的旧站必须保留，本方案不修改、不覆盖旧站。最终访问地址计划为：

```text
http://101.34.73.63:8080/
```

实际地址以部署完成后的验收记录为准。

## 2. 目标架构

```text
Browser
   |
   v
Nginx :8080
   |-- /            -> /opt/vintagecontacts/dist 静态文件
   |-- /api/*       -> 127.0.0.1:4173 (Express)
   |-- /healthz     -> 127.0.0.1:4173/healthz
                          |
                          v
                 SQLite /var/lib/vintagecontacts/contacts.sqlite
```

- Nginx 负责静态文件、压缩、缓存和反向代理。
- Express 只监听本机 `127.0.0.1:4173`，不直接暴露到公网。
- SQLite 文件放在代码目录之外，避免更新代码时被覆盖。
- 使用独立目录 `/opt/node24` 安装 Node.js 24，不替换系统已有 Node，避免影响 80 端口的旧站。

## 3. 安全组与防火墙

| 端口 | 用途 | 建议 |
|---|---|---|
| 22 | SSH | 限制为自己的固定 IP |
| 80 | 旧站 | 保持现状，不要修改旧站配置 |
| 8080 | VintageContacts | 对公网开放，用于课程验收 |
| 4173 | Express | 只监听本机，不对公网开放 |

需要在腾讯云 Lighthouse 控制台 → 防火墙 → 添加规则：TCP 8080，来源 `0.0.0.0/0`。

## 4. 服务器准备

登录：

```sh
ssh -i ~/.ssh/vintagecontacts_lighthouse ubuntu@101.34.73.63
```

先只检查，不修改：

```sh
cat /etc/os-release
uname -m
free -h
df -h
ss -tlnp
nginx -v
node -v
sudo -n true
```

安装基础工具（如果尚未安装）：

```sh
sudo apt update
sudo apt install -y git curl xz-utils sqlite3
```

安装独立 Node.js 24（示例版本以当时最新 v24 为准）：

```sh
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o /tmp/node24-sums.txt
# 从 https://nodejs.org/dist/latest-v24.x/ 找到 linux-x64.tar.xz 文件名
curl -fsSL https://nodejs.org/dist/latest-v24.x/node-v24.x.x-linux-x64.tar.xz -o /tmp/node24.tar.xz
sudo mkdir -p /opt/node24
sudo tar -xJf /tmp/node24.tar.xz -C /opt/node24 --strip-components=1
/opt/node24/bin/node -v
/opt/node24/bin/npm -v
```

不要在未确认旧站运行方式前替换 `/usr/bin/node`。

## 5. 目录与权限

```sh
sudo mkdir -p /opt/vintagecontacts /var/lib/vintagecontacts /var/backups/vintagecontacts
sudo chown -R ubuntu:ubuntu /opt/vintagecontacts
sudo chown -R www-data:www-data /var/lib/vintagecontacts /var/backups/vintagecontacts
```

## 6. 部署应用

```sh
git clone -b feature/backend-api https://github.com/Yuminu/VintageContacts.git /opt/vintagecontacts
cd /opt/vintagecontacts
PATH=/opt/node24/bin:$PATH /opt/node24/bin/npm ci --omit=dev
```

合并 PR 后改为从 `main` 部署：

```sh
cd /opt/vintagecontacts
git fetch origin
git checkout main
git pull --ff-only
PATH=/opt/node24/bin:$PATH /opt/node24/bin/npm ci --omit=dev
```

## 7. systemd 服务

复制 `deploy/vintagecontacts.service`：

```sh
sudo cp deploy/vintagecontacts.service /etc/systemd/system/vintagecontacts.service
sudo systemctl daemon-reload
sudo systemctl enable --now vintagecontacts
sudo systemctl status vintagecontacts
curl http://127.0.0.1:4173/healthz
```

服务环境变量：

| 变量 | 值 |
|---|---|
| `HOST` | `127.0.0.1` |
| `PORT` | `4173` |
| `DB_PATH` | `/var/lib/vintagecontacts/contacts.sqlite` |
| `SEED_DEMO` | `true`（首次演示数据；正式使用可改为 `false`） |

## 8. Nginx 配置

复制 `deploy/nginx.conf` 为独立站点，监听 8080：

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/vintagecontacts
sudo ln -s /etc/nginx/sites-available/vintagecontacts /etc/nginx/sites-enabled/vintagecontacts
sudo nginx -t
sudo systemctl reload nginx
```

不要删除或修改旧的 80 站点配置。确认：

```sh
sudo nginx -T | grep -n "listen"
```

## 9. 外部网络验收

不要用服务器本机的 `localhost` 作为验收依据。使用手机蜂窝网络或其他外部网络访问：

```text
http://101.34.73.63:8080/
```

完成：

- 首页可以打开。
- 新增联系人并刷新，数据仍然存在。
- 收藏和取消收藏。
- 一个联系人多个电话、邮箱、社交账号。
- Excel 导入和导出。
- 重启服务后数据仍然存在。
- 截图保存腾讯云控制台和浏览器访问结果。

## 10. 数据库备份

```sh
sudo DB_PATH=/var/lib/vintagecontacts/contacts.sqlite \
  BACKUP_DIR=/var/backups/vintagecontacts \
  bash scripts/backup-db.sh
```

建议每天通过 cron 执行一次，并确认备份文件可读。备份目录不能放在 Nginx 静态目录下。

## 11. 更新与回滚

更新：

```sh
sudo bash /opt/vintagecontacts/scripts/deploy.sh
```

回滚：

```sh
cd /opt/vintagecontacts
sudo git log --oneline -10
sudo git checkout <上一个稳定提交>
PATH=/opt/node24/bin:$PATH /opt/node24/bin/npm ci --omit=dev
sudo systemctl restart vintagecontacts
```

回滚前先备份数据库。

## 12. 实际部署记录

部署完成后填写，不提前填写：

| 项目 | 内容 |
|---|---|
| 部署日期 | 待填写 |
| 公网访问地址 | 待填写（计划 `http://101.34.73.63:8080/`） |
| 服务器地域 | 待填写 |
| 操作系统 | Ubuntu 22.04 |
| Node.js 版本 | 待填写（计划 24 LTS） |
| Nginx 版本 | 待填写（服务器已有 1.18.0） |
| 安全组端口 | 待填写（计划 8080） |
| 验收截图位置 | 待填写 |

## 13. 注意事项

- 中国大陆地域服务器对外提供网站服务涉及 ICP 备案要求；仅使用公网 IP 也不等于免备案。课程验收前先确认老师接受 IP + 非标准端口访问。
- 不把 SSH 私钥、密码、`.env` 或数据库文件提交到 Git。
- 不把 SQLite 文件放在 Nginx 可直接公开访问的目录。
- 当前应用没有登录和多用户权限；同一 URL 的所有访问者共享同一份通讯录数据。演示时不要填写真实个人隐私。
- 旧站占用 80 端口，本项目使用 8080；不要在未确认的情况下替换旧站。
