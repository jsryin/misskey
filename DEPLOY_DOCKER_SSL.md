# Docker + Nginx + Certbot

This repository now includes a production Docker deployment path for:

- Misskey on the internal `3000` port
- Nginx on `80/443`
- Certbot with automatic renewal

## Architecture

- `web` listens only inside Docker on `3000`
- `nginx` is the only public entrypoint
- `certbot` uses the ACME webroot challenge
- certificates are stored in `./letsencrypt`

## Files

- `compose.yml`
- `docker/nginx/init.conf`
- `docker/nginx/https.conf`
- `scripts/bootstrap-ssl.sh`

## Prerequisites

1. DNS `A` record for `kho.cc.cd` must point to this server.
2. Ports `80` and `443` must be open in the server firewall and cloud security group.
3. `.config/default.yml` must keep:

```yml
url: https://kho.cc.cd/
port: 3000
```

## First-time setup

Run this on the server from the project root:

```bash
chmod +x ./scripts/bootstrap-ssl.sh
EMAIL=admin@kho.cc.cd ./scripts/bootstrap-ssl.sh
```

What the script does:

1. starts `redis`, `web`, and HTTP-only `nginx`
2. requests the certificate for `kho.cc.cd`
3. reloads `nginx`, which auto-switches to the HTTPS config as soon as the certificate exists
4. starts the long-running `certbot` renewal container

The bootstrap script explicitly overrides the `certbot` service entrypoint during first issuance so it can run `certonly` even though the long-running service itself uses `/bin/sh` for the renewal loop.

## Normal operations

Start or update services:

```bash
docker compose up -d --build
```

Check logs:

```bash
docker compose logs -f web nginx certbot
```

Check certificate renewal:

```bash
docker compose exec certbot certbot certificates
```
