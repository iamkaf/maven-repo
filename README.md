# Maven Repository Platform

A self-hosted, immutable Maven repository platform backed by Cloudflare infrastructure.

**Live site:** https://z.kaf.sh

---

## Quick Links

- [Architecture Overview](#architecture)
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Deploying Infrastructure](#deploying-infrastructure)
- [Deploying the Worker API](#deploying-the-worker-api)
- [Deploying the Frontend](#deploying-the-frontend)
- [Publishing Artifacts](#publishing-artifacts)
- [Project Structure](#project-structure)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  maven.kaf.sh          │          z.kaf.sh                   │
│  (R2 Custom Domain)    │          (Pages + Worker)           │
│       │                │               │                     │
│       │                │    ┌──────────┴──────────┐         │
│       │                │    │                     │         │
│       │                │    │                     │         │
│  /com/**           /api/*    /                Browser       │
│  (Artifacts)    (Worker API)  (Frontend UI)     Requests    │
│       │                │        │                     │      │
│       └────────────────┴────────┴─────────────────────┘      │
│                         │                                    │
│                         ▼                                    │
│                  R2 Bucket                                   │
│                  (Immutable Storage)                         │
│                                                              │
│  Publishing (CI Only) ────────► R2 Bucket (Write)           │
└─────────────────────────────────────────────────────────────┘
```

**URLs:**
- Maven artifacts: `https://maven.kaf.sh/{group}/{artifact}/{version}/{file}`
- Frontend UI: `https://z.kaf.sh`
- Metadata API: `https://z.kaf.sh/api/*`

**Components:**
- **R2 Bucket:** Immutable artifact storage
- **Cloudflare Worker:** Read-only metadata API
- **Cloudflare Pages:** Static frontend UI
- **DNS & CDN:** Global distribution

---

## Prerequisites

### Required Tools

1. **Terraform** (>= 1.0)
   ```bash
   # macOS
   brew install terraform

   # Linux
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

2. **Node.js** (>= 18)
   ```bash
   # macOS
   brew install node

   # Linux (Ubuntu/Debian)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Wrangler CLI** (for Worker/Pages deployment)
   ```bash
   npm install -g wrangler
   ```

### Cloudflare Setup

#### 1. Get Your Account ID

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click your account icon in the top-right
3. Copy your **Account ID** from the sidebar

#### 2. Create API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template OR create custom with:
   - **Account** → **Cloudflare Workers** → **Edit**
   - **Account** → **Workers R2 Storage** → **Edit**
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Zone** → **DNS** → **Edit** (if managing DNS via Terraform)
4. Set your preferred TTL
5. **Copy and store the token securely** (you won't see it again!)

#### 3. Get Zone ID (Optional)

If managing DNS via Terraform:
1. In Cloudflare Dashboard, select your domain
2. Copy the **Zone ID** from the right sidebar

#### 4. Authenticate Wrangler

```bash
wrangler login
# Follow browser OAuth flow
```

---

## Initial Setup

### 1. Clone and Configure

```bash
cd /path/to/maven-repo

# Copy example Terraform variables
cp infra/terraform.tfvars.example infra/terraform.tfvars

# Edit terraform.tfvars with your values
nano infra/terraform.tfvars
```

**Required values in `terraform.tfvars`:**
```hcl
cloudflare_account_id = "your-account-id"
cloudflare_api_token  = "your-api-token"
zone_id               = "your-zone-id"  # optional, null if not managing DNS
```

### 2. Initialize Terraform

```bash
cd infra
terraform init
```

---

## Deploying Infrastructure

### Plan and Apply

```bash
cd infra

# Review the plan
terraform plan

# Apply the changes
terraform apply

# Confirm with 'yes' when prompted
```

### Verify Deployment

After `terraform apply` completes, you should see:
- R2 bucket created
- Worker script created
- Pages project created
- DNS records configured (if zone_id provided)

```bash
# View outputs
terraform output

# You should see:
# - r2_bucket_name
# - r2_bucket_id
# - worker_url
# - pages_url
# - r2_write_token (sensitive)
```

**Save the R2 write token** - you'll need it for CI publishing!

---

## Deploying the Worker API

The Worker provides the `/api/*` endpoints for browsing artifacts.

### Setup

```bash
cd worker
npm install
```

### Configure Wrangler

Edit `worker/wrangler.toml`:
```toml
name = "maven-metadata-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "R2"
bucket_name = "maven-kaf-sh-artifacts"  # From terraform output
```

### Deploy

```bash
wrangler deploy
```

### Test Locally

```bash
wrangler dev

# In another terminal:
curl http://localhost:8787/api/groups
```

---

## Deploying the Frontend

The frontend is a React SPA hosted on Cloudflare Pages.

### Setup

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
# Open http://localhost:5173
```

### Production Deploy

If connected to GitHub repository, Cloudflare Pages will auto-deploy on push to `main`.

Manual deploy:
```bash
npm run build
wrangler pages deploy dist --project-name=maven-repo-frontend
```

---

## Publishing Artifacts

Artifacts are published from your library's CI pipeline.

### Prerequisites

1. **R2 Write Token** - From `terraform output r2_write_token`
2. Add token as CI secret: `R2_WRITE_TOKEN`

### Publishing Workflow

In your library's `.github/workflows/publish.yml`:

```yaml
name: Publish to Maven Repository

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Publish to Maven Repository
        env:
          R2_WRITE_TOKEN: ${{ secrets.R2_WRITE_TOKEN }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_BUCKET_NAME: maven-kaf-sh-artifacts
          GROUP_ID: com.iamkaf        # Your groupId
          ARTIFACT_ID: your-artifact   # Your artifactId
          VERSION: ${{ github.ref_name }}
        run: |
          ./gradlew publishToMavenLocal
          ../maven-repo/scripts/publish-to-r2.sh "$GROUP_ID" "$ARTIFACT_ID" "$VERSION"
```

**Required CI Secrets:**
- `R2_WRITE_TOKEN` - R2 API token with write access
- `R2_ACCOUNT_ID` - Cloudflare Account ID

### Manual Publishing

```bash
# From your library project
./gradlew publishToMavenLocal

# Sync to R2
cd ../maven-repo/scripts
export R2_WRITE_TOKEN="your-token"
export R2_ACCOUNT_ID="your-account-id"
./publish-to-r2.sh com.iamkaf your-artifact 1.0.0
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/groups` | List top-level groups |
| `GET /api/artifacts?group=com.iamkaf` | List artifacts in a group |
| `GET /api/versions?group=...&artifact=...` | List versions |
| `GET /api/files?group=...&artifact=...&version=...` | List files for a version |
| `GET /api/latest?group=...&artifact=...` | Get latest version |

---

## Project Structure

```
maven-repo/
├── infra/              # Terraform infrastructure
│   ├── main.tf         # Resource definitions
│   ├── variables.tf    # Input variables
│   ├── outputs.tf      # Output values
│   └── provider.tf     # Provider configuration
├── worker/             # Cloudflare Worker (API)
│   ├── src/
│   │   └── index.ts    # Worker entry point
│   ├── package.json
│   └── wrangler.toml
├── frontend/           # React SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── lib/
│   │       └── api.ts  # API client
│   ├── package.json
│   └── vite.config.ts
├── scripts/            # Operational scripts
│   ├── sync-to-r2.sh
│   └── publish-to-r2.sh
├── .github/
│   └── workflows/      # CI/CD workflows
└── SPEC.md             # Full specification
```

---

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `CLOUDFLARE_API_TOKEN` | Terraform auth | `infra/terraform.tfvars` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | `infra/terraform.tfvars` |
| `R2_WRITE_TOKEN` | Publishing to R2 | Library CI secrets |
| `R2_ACCOUNT_ID` | Cloudflare account for R2 operations | Publishing scripts/CI |
| `R2_BUCKET_NAME` | Target bucket | Publishing scripts |

---

## Troubleshooting

### Terraform Issues

**"Error: failed to discover module"**
```bash
cd infra
terraform init -upgrade
```

**"Error: authentication required"**
- Verify `cloudflare_api_token` in `terraform.tfvars`
- Check token has required permissions

### Worker Issues

**"Error: R2 binding not found"**
- Verify bucket name in `wrangler.toml` matches Terraform output
- Run `wrangler secret bulk` to check bindings

### Publishing Issues

**"Error: version already exists"**
- This is expected! Version immutability is enforced.
- Bump the version number and try again.

---

## License

MIT

---

## See Also

- [Full Specification](./SPEC.md)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
