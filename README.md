su dockerjvx
cd /work/front/misskey

docker compose up -d --force-recreate redis

docker compose build web

docker compose up -d web