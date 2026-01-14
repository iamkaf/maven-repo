#!/usr/bin/env bash
#
# publish-to-r2.sh
#
# Complete publishing workflow: build, publish to local Maven, and sync to R2.
# This is a convenience wrapper for CI pipelines.
#
# Environment Variables:
#   R2_WRITE_TOKEN    - R2 API token with write access (required)
#   R2_ACCOUNT_ID     - Cloudflare Account ID (required)
#   R2_BUCKET_NAME    - Target R2 bucket name (default: maven-kaf-sh-artifacts)
#   BUILD_COMMAND     - Command to build and publish to local Maven (default: ./gradlew publishToMavenLocal)
#   GROUP_ID          - Maven groupId (required)
#   ARTIFACT_ID       - Maven artifactId (required)
#   VERSION           - Version to publish (default: extracted from build or detected)
#
# Usage:
#   ./publish-to-r2.sh <group-id> <artifact-id> <version>
#
# Example:
#   ./publish-to-r2.sh com.iamkaf amber 1.0.0

set -euo pipefail

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

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
if [[ $# -lt 3 ]]; then
  log_error "Usage: $0 <group-id> <artifact-id> <version>"
  echo "Example: $0 com.iamkaf amber 1.0.0"
  exit 1
fi

GROUP_ID="$1"
ARTIFACT_ID="$2"
VERSION="$3"

# Convert groupId to path (com.iamkaf -> com/iamkaf)
GROUP_PATH="${GROUP_ID//.//}"

log_info "Starting publish workflow for ${GROUP_ID}:${ARTIFACT_ID}:${VERSION}"

# Step 1: Build and publish to local Maven
log_info "Step 1: Building and publishing to local Maven..."

BUILD_COMMAND="${BUILD_COMMAND:-}"

if [[ -n "${BUILD_COMMAND}" ]]; then
  log_info "Running: ${BUILD_COMMAND}"
  eval "${BUILD_COMMAND}"
else
  log_warn "No BUILD_COMMAND specified. Skipping build step."
  log_warn "Ensure you've already published to local Maven repository."
fi

# Step 2: Sync to R2
log_info "Step 2: Syncing artifacts to R2..."

exec "${SCRIPT_DIR}/sync-to-r2.sh" "${GROUP_PATH}" "${ARTIFACT_ID}" "${VERSION}"
