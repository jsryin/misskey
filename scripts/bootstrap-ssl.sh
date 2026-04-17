#!/bin/sh

set -eu

DOMAIN="${DOMAIN:-kho.cc.cd}"
EMAIL="${EMAIL:-}"
COMPOSE="${COMPOSE:-docker compose}"
WEBROOT_DIR="${WEBROOT_DIR:-./certbot-www}"
LE_DIR="${LE_DIR:-./letsencrypt}"

if [ -z "$EMAIL" ]; then
	echo "EMAIL is required, example:"
	echo "  EMAIL=admin@kho.cc.cd ./scripts/bootstrap-ssl.sh"
	exit 1
fi

mkdir -p "$LE_DIR"

$COMPOSE up -d redis web
$COMPOSE up -d --force-recreate nginx

if ! $COMPOSE exec -T nginx test -d /var/www/certbot; then
	echo "nginx container does not have /var/www/certbot mounted."
	echo "Check docker compose volumes and recreate the nginx container."
	exit 1
fi

PROBE_PATH="/var/www/certbot/.well-known/acme-challenge/codex-probe"
$COMPOSE exec -T nginx sh -c "mkdir -p /var/www/certbot/.well-known/acme-challenge && printf '%s\n' ok > $PROBE_PATH"

if ! curl -fsS -H "Host: $DOMAIN" "http://127.0.0.1/.well-known/acme-challenge/codex-probe" >/dev/null; then
	echo "ACME webroot probe failed. nginx is not serving $WEBROOT_DIR/.well-known/acme-challenge correctly."
	echo "Check these commands:"
	echo "  docker compose exec nginx ls -la /var/www/certbot/.well-known/acme-challenge"
	echo "  docker compose exec nginx nginx -T"
	$COMPOSE exec -T nginx rm -f "$PROBE_PATH"
	exit 1
fi

$COMPOSE exec -T nginx rm -f "$PROBE_PATH"

$COMPOSE run --rm --entrypoint certbot certbot certonly \
	--webroot \
	-w /var/www/certbot \
	-d "$DOMAIN" \
	--email "$EMAIL" \
	--agree-tos \
	--no-eff-email \
	--rsa-key-size 4096

$COMPOSE exec nginx nginx -s reload
$COMPOSE up -d certbot

echo "HTTPS is enabled for https://$DOMAIN"
