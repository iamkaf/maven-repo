#!/usr/bin/env bash
#
# upload-r2-index.sh
#
# Uploads the index.html redirect page to the root of the R2 bucket.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_FILE="${SCRIPT_DIR}/../infra/r2-index.html"

if [[ ! -f "${INDEX_FILE}" ]]; then
  echo "Error: index.html not found at ${INDEX_FILE}"
  exit 1
fi

echo "Uploading redirect page to R2..."
wrangler r2 object put maven-kaf-sh-artifacts/index.html --file="${INDEX_FILE}" --remote

echo "Done! Visit https://maven.kaf.sh to test the redirect."
