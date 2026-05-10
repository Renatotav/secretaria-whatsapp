#!/bin/sh
node /app/migrate.mjs
node /app/scheduler.mjs &
node server.js
