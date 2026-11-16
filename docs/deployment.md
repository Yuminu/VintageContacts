# 部署文档

> 当前状态：部署方案已准备，尚未执行云服务器部署。实际公网地址、截图和服务器版本在部署完成后补充，不提前填写。

## 1. 目标架构

```text
Browser
   |
   v
Nginx :80
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
- 计划使用腾讯云 Lighthouse，Ubuntu 24.04，Node.js 24 LTS。

## 2. 服务器准备

安全组只开放必要端口：

| 端口 | 用途 | 建议 |
|---|---|---|
| 22 | SSH | 限制为自己的固定 IP |
| 80 | HTTP | 对公网开放，用于课程验收 |
| 443 | HTTPS | 有域名和证书时再开放 |
| 4173 | Express | 不对公网开放 |

安装依赖：

```sh
sudo apt update
sudo apt install -y nginx git sqlite3 curl
```

安装 Node.js 24 LTS（使用 NodeSource 或官方二进制包），确认：

```sh
node -v
npm -v
```

## 3. 目录与权限

```sh
sudo mkdir -p /opt/vintagecontacts /var/lib/vintagecontacts /var/backups/vintagecontacts
sudo chown -R www-data:www-data /var/lib/vintagecontacts /var/backups/vintagecontacts
```

代码放在 `/opt/vintagecontacts`，数据库放在 `/var/lib/vintagecontacts/contacts.sqlite`。

## 4. 部署应用

```sh
sudo git clone https://github.com/Yuminu/VintageContacts.git /opt/vintagecontacts
cd /opt/vintagecontacts
sudo npm ci --omit=dev
```

如果目录已经存在，使用项目脚本更新：

```sh
sudo bash scripts/deploy.sh
```

## 5. systemd 服务

复制并启用 `deploy/vintagecontacts.service`：

```sh
sudo cp deploy/vintagecontacts.service /etc/systemd/system/vintagecontacts.service
sudo systemctl daemon-reload
sudo systemctl enable --now vintagecontacts
sudo systemctl status vintagecontacts
curl http://127.0.0.1:4173/healthz
```

服务使用以下环境变量：

| 变量 | 值 |
|---|---|
| `HOST` | `127.0.0.1` |
| `PORT` | `4173` |
| `DB_PATH` | `/var/lib/vintagecontacts/contacts.sqlite` |
| `SEED_DEMO` | `true`（首次演示数据；正式使用可改为 `false`） |

## 6. Nginx 配置

复制 `deploy/nginx.conf` 到 Nginx 站点目录，例如：

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/vintagecontacts
sudo ln -s /etc/nginx/sites-available/vintagecontacts /etc/nginx/sites-enabled/vintagecontacts
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

确认 `/opt/vintagecontacts/dist` 对 Nginx 可读。

## 7. 外部网络验收

不要用服务器本机的 `localhost` 作为验收依据。使用手机蜂窝网络或其他外部网络访问公网 IP，并完成：

- 首页可以打开。
- 新增联系人并刷新，数据仍然存在。
- 收藏和取消收藏。
- 一个联系人多个电话、邮箱、社交账号。
- Excel 导入和导出。
- 重启服务后数据仍然存在。
- 截图保存腾讯云控制台和浏览器访问结果。

## 8. 数据库备份

```sh
sudo DB_PATH=/var/lib/vintagecontacts/contacts.sqlite \
  BACKUP_DIR=/var/backups/vintagecontacts \
  bash scripts/backup-db.sh
```

建议每天通过 cron 执行一次，并确认备份文件可读。备份目录不能放在 Nginx 静态目录下。

## 9. 更新与回滚

更新：

```sh
sudo bash /opt/vintagecontacts/scripts/deploy.sh
```

回滚：

```sh
cd /opt/vintagecontacts
sudo git log --oneline -10
sudo git checkout <上一个稳定提交>
sudo npm ci --omit=dev
sudo systemctl restart vintagecontacts
```

回滚前先备份数据库。

## 10. 实际部署记录

部署完成后填写，不提前填写：

| 项目 | 内容 |
|---|---|
| 部署日期 | 待填写 |
| 公网访问地址 | 待填写 |
| 服务器地域 | 待填写 |
| 操作系统 | 待填写 |
| Node.js 版本 | 待填写 |
| Nginx 版本 | 待填写 |
| 安全组端口 | 待填写 |
| 验收截图位置 | 待填写 |

## 11. 注意事项

- 中国大陆地域服务器对外提供网站服务涉及 ICP 备案要求；仅使用公网 IP 也不等于免备案。课程验收前先确认老师接受 IP 访问。
- 不把 SSH 私钥、密码、`.env` 或数据库文件提交到 Git。
- 不把 SQLite 文件放在 Nginx 可直接公开访问的目录。
- 当前应用没有登录和多用户权限；同一 URL 的所有访问者共享同一份通讯录数据。演示时不要填写真实个人隐私。
