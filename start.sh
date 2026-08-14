#!/bin/sh
npx prisma db push --accept-data-loss
node /app/scheduler.mjs &
node server.js
