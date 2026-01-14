#!/usr/bin/env bash
#
# sync-to-r2.sh
#
# Syncs Maven artifacts from the local repository to Cloudflare R2.
# This script uses Wrangler CLI for R2 access.
#
# Environment Variables:
#   R2_WRITE_TOKEN    - R2 API token with write access (required)
#   R2_ACCOUNT_ID     - Cloudflare Account ID (required)
#   R2_BUCKET_NAME    - Target R2 bucket name (default: maven-kaf-sh-artifacts)
#   LOCAL_MAVEN_REPO  - Local Maven repository path (default: ~/.m2/repository)
#
# Usage:
#   ./sync-to-r2.sh <group-path> <artifact-id> <version>
#
# Example:
#   ./sync-to-r2.sh com/iamkaf amber 1.0.0

set -euo pipefail

# Configuration
R2_BUCKET_NAME="${R2_BUCKET_NAME:-maven-kaf-sh-artifacts}"
LOCAL_MAVEN_REPO="${LOCAL_MAVEN_REPO:-$HOME/.m2/repository}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check required environment variables
if [[ -z "${R2_ACCOUNT_ID:-}" ]]; then
  log_error "R2_ACCOUNT_ID environment variable is required"
  exit 1
fi

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
  log_error "Wrangler CLI is not installed. Please install it first:"
  echo "  npm install -g wrangler"
  exit 1
fi

# Parse arguments
if [[ $# -lt 3 ]]; then
  log_error "Usage: $0 <group-path> <artifact-id> <version>"
  echo "Example: $0 com/iamkaf amber 1.0.0"
  exit 1
fi

GROUP_PATH="$1"
ARTIFACT_ID="$2"
VERSION="$3"

# Construct source and destination paths
SOURCE_DIR="${LOCAL_MAVEN_REPO}/${GROUP_PATH}/${ARTIFACT_ID}/${VERSION}"
R2_PREFIX="${GROUP_PATH}/${ARTIFACT_ID}/${VERSION}"

# Verify source directory exists
if [[ ! -d "${SOURCE_DIR}" ]]; then
  log_error "Artifact directory does not exist: ${SOURCE_DIR}"
  log_error "Have you run 'mvn deploy' or 'gradlew publishToMavenLocal'?"
  exit 1
fi

# Check if version already exists in R2
log_info "Checking if version ${VERSION} already exists..."

# Use wrangler to check if prefix exists
if wrangler r2 object list "${R2_BUCKET_NAME}" --prefix="${R2_PREFIX}/" &>/dev/null; then
  # Check if any objects exist with this prefix
  OBJECTS=$(CLOUDFLARE_API_TOKEN="${R2_WRITE_TOKEN}" wrangler r2 object list "${R2_BUCKET_NAME}" --prefix="${R2_PREFIX}/" 2>/dev/null || echo "")

  if [[ -n "${OBJECTS}" ]] && [[ "${OBJECTS}" != *"no objects found"* ]]; then
    log_error "Version ${VERSION} already exists in R2 bucket!"
    log_error "Version immutability enforced. Please bump the version number."
    exit 1
  fi
fi

# Sync files to R2
log_info "Syncing artifacts to R2..."
log_info "  Source: ${SOURCE_DIR}"
log_info "  Bucket: ${R2_BUCKET_NAME}"
log_info "  Prefix:  ${R2_PREFIX}"

# Upload each file
find "${SOURCE_DIR}" -type f \( -name "*.jar" -o -name "*.pom" -o -name "*.module" -o -name "*.xml" -o -name "*.sha1" \) | while read -r file; do
  filename=$(basename "${file}")
  r2_key="${R2_PREFIX}/${filename}"

  log_info "  Uploading ${filename}..."
  wrangler r2 object put "${R2_BUCKET_NAME}" --path="${r2_key}" --file="${file}"
done

log_info "Sync complete!"

# Verify upload
log_info "Verifying upload..."

FILE_COUNT=$(find "${SOURCE_DIR}" -type f \( -name "*.jar" -o -name "*.pom" -o -name "*.module" -o -name "*.xml" \) | wc -l)

log_info "Uploaded ${FILE_COUNT} files for ${GROUP_PATH}/${ARTIFACT_ID}:${VERSION}"
