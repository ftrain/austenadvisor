#!/bin/sh
# Tiny Little Office's library, built from its v2 branch and kept here as a tarball (the published package lags v2).
#   sh scripts/vendor-tlo.sh [ref]     # needs Node 24
set -e
REF=${1:-v2}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
git clone -q --depth 1 --branch "$REF" https://github.com/aboard-io/tinylittleoffice "$TMP/tlo"
cd "$TMP/tlo"
SHA=$(git rev-parse --short HEAD)
npm ci --silent
npm run build:lib --silent
cd packages/doc
npm pack --silent --pack-destination "$TMP"
rm -f "$ROOT"/vendor/tinylittleoffice-*.tgz
mv "$TMP"/tinylittleoffice-*.tgz "$ROOT/vendor/tinylittleoffice-$REF-$SHA.tgz"
cd "$ROOT"
npm pkg set "dependencies.tinylittleoffice=file:vendor/tinylittleoffice-$REF-$SHA.tgz"
npm install
echo "vendor/tinylittleoffice-$REF-$SHA.tgz"
