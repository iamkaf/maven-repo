#!/usr/bin/env bash
#
# sync-legacy-to-r2.sh
#
# Syncs all Maven artifacts from a legacy git-based Maven repository to Cloudflare R2.
# This script preserves the full directory structure and uploads all versions.
#
# Environment Variables:
#   R2_WRITE_TOKEN    - R2 API token with write access (required)
#   R2_ACCOUNT_ID     - Cloudflare Account ID (required)
#   R2_BUCKET_NAME    - Target R2 bucket name (default: maven-kaf-sh-artifacts)
#   LEGACY_MAVEN_REPO - Legacy Maven repository path (default: ~/code/apps/modresources/maven)
#
# Usage:
#   ./sync-legacy-to-r2.sh [artifact-pattern]
#
# Examples:
#   ./sync-legacy-to-r2.sh                    # Sync all artifacts
#   ./sync-legacy-to-r2.sh com/iamkaf/amber   # Sync only amber artifacts

set -euo pipefail

# Configuration
R2_BUCKET_NAME="${R2_BUCKET_NAME:-maven-kaf-sh-artifacts}"
LEGACY_MAVEN_REPO="${LEGACY_MAVEN_REPO:-$HOME/code/apps/modresources/maven}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_progress() {
  echo -e "${BLUE}[>>]${NC} $1"
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

# Verify legacy repo exists
if [[ ! -d "${LEGACY_MAVEN_REPO}" ]]; then
  log_error "Legacy Maven repository does not exist: ${LEGACY_MAVEN_REPO}"
  exit 1
fi

# Parse optional pattern argument
PATTERN="${1:-}"

log_info "Starting legacy Maven repository sync to R2..."
log_info "  Source: ${LEGACY_MAVEN_REPO}"
log_info "  Bucket: ${R2_BUCKET_NAME}"
if [[ -n "${PATTERN}" ]]; then
  log_info "  Pattern: ${PATTERN}"
fi

# Find all version directories (containing .pom files)
log_info "Scanning for artifacts..."

# Build find command based on pattern
if [[ -n "${PATTERN}" ]]; then
  VERSION_DIRS=$(find "${LEGACY_MAVEN_REPO}/${PATTERN}" -name "*.pom" -exec dirname {} \; | sort -u)
else
  VERSION_DIRS=$(find "${LEGACY_MAVEN_REPO}" -name "*.pom" -exec dirname {} \; | sort -u)
fi

TOTAL_VERSIONS=$(echo "${VERSION_DIRS}" | grep -c '^' || echo "0")

if [[ "${TOTAL_VERSIONS}" -eq 0 ]]; then
  log_error "No artifacts found"
  exit 1
fi

log_info "Found ${TOTAL_VERSIONS} version directories to process"

# Counters
CURRENT=0
SKIPPED=0
UPLOADED=0
FAILED=0

# Counter files for subshell communication
COUNTER_DIR=$(mktemp -d)
echo "0" > "${COUNTER_DIR}/current"
echo "0" > "${COUNTER_DIR}/skipped"
echo "0" > "${COUNTER_DIR}/uploaded"
echo "0" > "${COUNTER_DIR}/failed"

# Process each version directory
echo "${VERSION_DIRS}" | while IFS= read -r version_dir; do
  CURRENT=$(<"${COUNTER_DIR}/current")
  ((CURRENT++)) || true
  echo "${CURRENT}" > "${COUNTER_DIR}/current"

  # Get relative path from legacy repo
  rel_path="${version_dir#${LEGACY_MAVEN_REPO}/}"
  r2_prefix="${rel_path}"

  log_progress "[${CURRENT}/${TOTAL_VERSIONS}] Processing: ${rel_path}"

  # Check if this version already exists in R2 (by checking for the .pom file)
  pom_file=$(find "${version_dir}" -maxdepth 1 -name "*.pom" -print -quit)
  if [[ -n "${pom_file}" ]]; then
    pom_filename=$(basename "${pom_file}")
    if wrangler r2 object get "${R2_BUCKET_NAME}/${r2_prefix}/${pom_filename}" --remote &>/dev/null; then
      log_warn "  Skipping (already exists): ${rel_path}"
      SKIP=$(<"${COUNTER_DIR}/skipped")
      ((SKIP++)) || true
      echo "${SKIP}" > "${COUNTER_DIR}/skipped"
      continue
    fi
  fi

  # Find all files in this version directory
  find "${version_dir}" -type f | while read -r file; do
    filename=$(basename "${file}")
    r2_key="${r2_prefix}/${filename}"

    # Upload file
    if wrangler r2 object put "${R2_BUCKET_NAME}/${r2_key}" --file="${file}" --remote &>/dev/null; then
      echo "    ✓ ${filename}"
    else
      log_error "  ✗ Failed to upload: ${filename}"
      FAIL=$(<"${COUNTER_DIR}/failed")
      ((FAIL++)) || true
      echo "${FAIL}" > "${COUNTER_DIR}/failed"
    fi
  done

  UP=$(<"${COUNTER_DIR}/uploaded")
  ((UP++)) || true
  echo "${UP}" > "${COUNTER_DIR}/uploaded"

done

# Upload maven-metadata.xml files at artifact level
log_info "Uploading maven-metadata.xml files..."

while IFS= read -r -d '' metadata_file; do
  rel_path="${metadata_file#$LEGACY_MAVEN_REPO/}"
  r2_key="${rel_path}"

  # Check if already exists
  if wrangler r2 object get "${R2_BUCKET_NAME}/${r2_key}" --remote &>/dev/null; then
    echo "    ⊙ Skipping existing: ${r2_key}"
    ((SKIPPED++)) || true
    continue
  fi

  # Upload metadata file
  if wrangler r2 object put "${R2_BUCKET_NAME}/${r2_key}" --file="${metadata_file}" --remote &>/dev/null; then
    echo "    ✓ ${r2_key}"
  else
    log_error "  ✗ Failed to upload: ${r2_key}"
    ((FAILED++)) || true
  fi
done < <(find "${LEGACY_MAVEN_REPO}" -name "maven-metadata.xml" -print0)

# Read final counter values
SKIPPED=$(<"${COUNTER_DIR}/skipped")
UPLOADED=$(<"${COUNTER_DIR}/uploaded")
FAILED=$(<"${COUNTER_DIR}/failed")
rm -rf "${COUNTER_DIR}"

# Summary
echo ""
log_info "Sync complete!"
echo "  Total versions:    ${TOTAL_VERSIONS}"
echo -e "  Uploaded:          ${GREEN}${UPLOADED}${NC}"
echo -e "  Skipped:           ${YELLOW}${SKIPPED}${NC}"
if [[ "${FAILED}" -gt 0 ]]; then
  echo -e "  Failed uploads:    ${RED}${FAILED}${NC}"
fi
