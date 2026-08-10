#!/bin/sh
npx prisma migrate deploy
node /app/scheduler.mjs &
node server.js
