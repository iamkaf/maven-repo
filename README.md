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

Artifacts can be published using **Gradle's maven-publish plugin** (recommended) or via **manual scripts**.

### Method 1: Gradle maven-publish Plugin (Recommended)

#### Prerequisites

1. **Configure Worker Secrets** (one-time setup):
   ```bash
   cd worker
   wrangler secret put MAVEN_PUBLISH_USERNAME  # Enter: maven
   wrangler secret put MAVEN_PUBLISH_PASSWORD  # Enter a strong password
   ```

2. **Add credentials** to your Gradle project's `~/.gradle/gradle.properties`:
   ```properties
   MAVEN_PUBLISH_USERNAME=maven
   MAVEN_PUBLISH_PASSWORD=your-password-here
   ```

#### Gradle Configuration

In your library's `build.gradle`:

```groovy
plugins {
    id 'java'
    id 'maven-publish'
}

publishing {
    publications {
        maven(MavenPublication) {
            from components.java
        }
    }

    repositories {
        maven {
            name = 'maven-kaf-sh'
            // Use /releases for release versions, /snapshots for snapshot versions
            url = project.version.endsWith('-SNAPSHOT')
                ? 'https://z.kaf.sh/snapshots'
                : 'https://z.kaf.sh/releases'

            credentials {
                username = System.getenv('MAVEN_PUBLISH_USERNAME')
                password = System.getenv('MAVEN_PUBLISH_PASSWORD')
            }
        }
    }
}
```

#### CI/CD Example

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
          MAVEN_PUBLISH_USERNAME: maven
          MAVEN_PUBLISH_PASSWORD: ${{ secrets.MAVEN_PUBLISH_PASSWORD }}
        run: ./gradlew publish
```

**Required CI Secret:**
- `MAVEN_PUBLISH_PASSWORD` - The password you set with `wrangler secret put`

#### Publishing

```bash
# Publish from your Gradle project
./gradlew publish
```

See [examples/gradle-publishing](./examples/gradle-publishing/) for a complete working example.

---

### Method 2: Manual Scripts (Legacy)

#### Prerequisites

1. **R2 Write Token** - From `terraform output r2_write_token`
2. Add token as CI secret: `R2_WRITE_TOKEN`

#### Publishing Workflow

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

### Public API (Read-Only)

| Endpoint | Description |
|----------|-------------|
| `GET /api/groups` | List top-level groups |
| `GET /api/artifacts?group=com.iamkaf` | List artifacts in a group |
| `GET /api/versions?group=...&artifact=...` | List versions |
| `GET /api/files?group=...&artifact=...&version=...` | List files for a version |
| `GET /api/latest?group=...&artifact=...` | Get latest version |

### Publishing Endpoints (Authenticated)

| Endpoint | Authentication | Description |
|----------|----------------|-------------|
| `PUT /releases/*` | Basic Auth | Upload release artifacts (immutable) |
| `PUT /snapshots/*` | Basic Auth | Upload snapshot artifacts (mutable with timestamps) |

**Releases (`/releases/*`):**
- For immutable release versions
- Accepts PUT requests for Maven artifact files (.jar, .pom, .module, .xml, .sha1, .sha256, .asc)
- Path structure: `/releases/{group-path}/{artifact-id}/{version}/{filename}`
- Existing versions cannot be overwritten (returns 409)

Example:
```
PUT /releases/com/iamkaf/mylib/1.0.0/mylib-1.0.0.jar
```

**Snapshots (`/snapshots/*`):**
- For mutable snapshot versions (version must end with `-SNAPSHOT`)
- Automatically generates timestamped filenames (e.g., `mylib-1.0-20250121.143052-1.jar`)
- Auto-generates `maven-metadata.xml` with snapshot information
- Path structure: `/snapshots/{group-path}/{artifact-id}/{version}-SNAPSHOT/{filename}`

Example:
```
PUT /snapshots/com/iamkaf/mylib/1.0-SNAPSHOT/mylib-1.0-SNAPSHOT.jar
```

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
├── examples/           # Example projects
│   └── gradle-publishing/  # Gradle publishing example
├── .github/
│   └── workflows/      # CI/CD workflows
└── SPEC.md             # Full specification
```

---

## Environment Variables

### Infrastructure

| Variable | Purpose | Where |
|----------|---------|-------|
| `CLOUDFLARE_API_TOKEN` | Terraform auth | `infra/terraform.tfvars` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | `infra/terraform.tfvars` |

### Publishing (Method 1: Gradle maven-publish)

| Variable | Purpose | Where |
|----------|---------|-------|
| `MAVEN_PUBLISH_USERNAME` | Publish username | Worker secret (set via `wrangler secret put`) |
| `MAVEN_PUBLISH_PASSWORD` | Publish password | Worker secret (set via `wrangler secret put`) |

### Publishing (Method 2: Manual Scripts)

| Variable | Purpose | Where |
|----------|---------|-------|
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

**Gradle: "401 Authentication required"**
- Verify `MAVEN_PUBLISH_USERNAME` and `MAVEN_PUBLISH_PASSWORD` are set correctly
- Check Worker secrets: `cd worker && wrangler secret list`
- Ensure credentials are exported as environment variables or in `~/.gradle/gradle.properties`

**Gradle: "409 Version already exists"**
- Same as above - version immutability is enforced
- Bump version and try again

**Gradle: "404 Not found" when uploading**
- Verify the Worker route is deployed: `terraform apply`
- Check Worker is deployed: `wrangler deploy`

---

## License

MIT

---

## See Also

- [Full Specification](./SPEC.md)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
