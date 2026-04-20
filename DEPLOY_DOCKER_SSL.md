# Docker + Nginx + Certbot

这个仓库现在包含一套可用于生产环境的 Docker 部署方案，用于运行：

- 监听内部 `3000` 端口的 Misskey
- 监听 `80/443` 的 Nginx
- 支持自动续期的 Certbot

## 架构

- `web` 仅在 Docker 内部监听 `3000`
- `nginx` 是唯一的公网入口
- `certbot` 使用 ACME webroot 验证方式
- 证书保存在 `./letsencrypt`

## 文件

- `compose.yml`
- `docker/nginx/init.conf`
- `docker/nginx/https.conf`
- `scripts/bootstrap-ssl.sh`

## 前置条件

1. `kho.cc.cd` 的 DNS `A` 记录必须指向当前服务器。
2. 服务器防火墙和云安全组必须放行 `80` 和 `443` 端口。
3. `.config/default.yml` 需要保持为：

```yml
url: https://kho.cc.cd/
port: 3000
```

## 首次部署

在服务器上进入项目根目录后执行：

```bash
chmod +x ./scripts/bootstrap-ssl.sh
EMAIL=admin@kho.cc.cd ./scripts/bootstrap-ssl.sh
```

脚本会执行以下操作：

1. 启动 `redis`、`web` 和仅提供 HTTP 的 `nginx`
2. 为 `kho.cc.cd` 申请证书
3. 重新加载 `nginx`，证书生成后会自动切换到 HTTPS 配置
4. 启动长期运行的 `certbot` 续期容器

这个 bootstrap 脚本会在首次签发证书时显式覆盖 `certbot` 服务的 entrypoint，这样即使长期运行的服务本身使用 `/bin/sh` 做续期循环，也仍然可以执行 `certonly`。

## 日常操作

启动或更新服务：

```bash
docker compose up -d --build
```

如果你修改了 `docker/nginx/*.conf`，需要重建 `nginx` 容器，确保新配置被复制到 `/etc/nginx/conf.d/default.conf`：

```bash
docker compose up -d --force-recreate nginx
```

查看日志：

```bash
docker compose logs -f web nginx certbot
```

检查证书续期状态：

```bash
docker compose exec certbot certbot certificates
```

验证响应头：

```bash
curl -I https://kho.cc.cd
docker compose exec nginx nginx -T | grep server_tokens
```

说明：

- `server_tokens off;` 会隐藏 Nginx 的版本号，因此 `Server: nginx/1.28.x` 会变成 `Server: nginx`。
- 官方原版 Nginx 在没有额外模块的情况下，不能彻底移除自身的 `Server` 响应头。如果部署后你仍然看到完整版本号，通常说明容器仍在使用旧配置，或者请求实际经过了这个容器前面的另一个反向代理。
- `proxy_hide_header Server;` 和 `proxy_hide_header X-Powered-By;` 用于阻止上游应用的相关响应头透传到外部。
