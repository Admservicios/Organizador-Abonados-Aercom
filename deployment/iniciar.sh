#!/bin/sh
cd "$(dirname "$0")" || exit 1
exec ./runtime/node ./server/main.mjs
