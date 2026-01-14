# Deployment Summary

## Architecture Changes

### Current → New Architecture

**Before:**
- `maven.kaf.sh` → Pages (frontend)
- No public artifact access
- Worker route for `/api/*` on `maven.kaf.sh`

**After:**
- `maven.kaf.sh/*` → **R2 Custom Domain** (direct artifact access, zero Worker costs)
- `z.kaf.sh/*` → **Pages** (frontend UI)
- `z.kaf.sh/api/*` → **Worker** (metadata API)

## URLs

| Service | URL |
|---------|-----|
| Maven Artifacts | `https://maven.kaf.sh/{group}/{artifact}/{version}/{file}` |
| Frontend UI | `https://z.kaf.sh` |
| Metadata API | `https://z.kaf.sh/api/*` |

## Deployment Steps

### 1. Apply Terraform Changes
```bash
cd infra
terraform apply "tfplan"
```

**What happens:**
- Creates R2 custom domain for `maven.kaf.sh`
- Creates Pages project `maven-repo-frontend`
- Adds Pages custom domain `z.kaf.sh`
- Creates DNS record for `z.kaf.sh` → Pages

### 2. Deploy Worker with New Routes
```bash
cd worker
wrangler deploy
```

**What happens:**
- Worker is deployed with route `z.kaf.sh/api/*`
- R2 binding is configured

### 3. Upload Redirect Page to R2
```bash
chmod +x scripts/upload-r2-index.sh
./scripts/upload-r2-index.sh
```

**What happens:**
- Uploads `index.html` to R2 root
- Browser visitors to `maven.kaf.sh` are redirected to `z.kaf.sh`

### 4. Verify Deployment

**Check R2 custom domain:**
```bash
curl -I https://maven.kaf.sh/com/iamkaf/amber/amber-common/9.0.2/amber-common-9.0.2.pom
# Should return 200 OK

curl https://maven.kaf.sh/
# Should return HTML redirect page
```

**Check Worker API:**
```bash
curl https://z.kaf.sh/api/groups
# Should return JSON array of groups
```

**Check Frontend:**
```bash
curl https://z.kaf.sh/
# Should return HTML frontend
```

## Maven/Gradle Configuration

### Gradle
```kotlin
repositories {
  maven {
    url = uri("https://maven.kaf.sh")
  }
}

dependencies {
  implementation("com.iamkaf:amber:9.0.2")
}
```

### Maven
```xml
<repositories>
  <repository>
    <id>maven-kaf</id>
    <url>https://maven.kaf.sh</url>
  </repository>
</repositories>

<dependencies>
  <dependency>
    <groupId>com.iamkaf</groupId>
    <artifactId>amber</artifactId>
    <version>9.0.2</version>
  </dependency>
</dependencies>
```

## Important Notes

1. **Worker Routes:** The Worker route is configured in Terraform (`infra/main.tf`), not in `wrangler.toml`
2. **R2 Public Access:** Artifacts are served directly from R2 via custom domain
3. **Zero Worker Costs for Downloads:** Only API calls to `/api/*` invoke Workers
4. **Index Redirect:** Visiting `maven.kaf.sh` in a browser redirects to `z.kaf.sh`

## Rollback Plan

If something goes wrong:
1. Delete R2 custom domain via Cloudflare dashboard
2. Remove Worker route from `wrangler.toml` and redeploy
3. Run `terraform destroy` or revert state

## Files Modified

- `infra/main.tf` - Added R2 custom domain, moved Pages to z.kaf.sh
- `infra/variables.tf` - Added `frontend_domain` variable
- `infra/provider.tf` - Upgraded to Cloudflare provider v5
- `worker/wrangler.toml` - Added route for `z.kaf.sh/api/*`
- `infra/r2-index.html` - Created redirect page
- `scripts/upload-r2-index.sh` - Created upload script

## R2 Sync Status

The legacy repository sync is still running in background. Check progress:
```bash
tail -f /tmp/r2-sync.log
```

Once complete, all artifacts from `~/code/apps/modresources/maven` will be in R2.
