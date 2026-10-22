#!/bin/sh
# Atualiza as tabelas do banco. SEM --accept-data-loss: se a mudança fosse
# apagar dados (remover/renomear coluna, trocar tipo), o Prisma recusa, o app
# sobe com o banco como estava e o agendador avisa o dono no WhatsApp.
rm -f /tmp/db-push-falhou
if npx prisma db push > /tmp/db-push.log 2>&1; then
  cat /tmp/db-push.log
else
  cat /tmp/db-push.log
  echo "[banco] atualização das tabelas RECUSADA (apagaria dados) — app sobe com o banco como estava"
  touch /tmp/db-push-falhou
fi
node /app/scheduler.mjs &
node server.js
