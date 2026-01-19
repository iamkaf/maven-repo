# ------------------------------------------------------------------------------
# R2 Bucket for Maven Artifacts
# ------------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "artifacts" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
  location   = "ENAM" # Eastern North America

  lifecycle {
    prevent_destroy = true
  }
}

# R2 Custom Domain for public Maven repository access
resource "cloudflare_r2_custom_domain" "artifacts_domain" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.artifacts.name
  domain      = var.domain
  enabled     = true
  zone_id     = var.zone_id
}

# ------------------------------------------------------------------------------
# Cloudflare Worker for Metadata API
# ------------------------------------------------------------------------------
# Note: Worker code is managed via wrangler (see worker/ directory)
# The R2 bucket binding is configured in worker/wrangler.toml
# Terraform manages the route

# Worker route for /api/* on z.kaf.sh
resource "cloudflare_workers_route" "api_routes" {
  zone_id = var.zone_id
  pattern = "${var.frontend_domain}/api/*"
  script  = var.worker_name
}

# Worker route for /publish/* on z.kaf.sh
resource "cloudflare_workers_route" "publish_routes" {
  zone_id = var.zone_id
  pattern = "${var.frontend_domain}/publish/*"
  script  = var.worker_name
}

# ------------------------------------------------------------------------------
# Cloudflare Pages for Frontend
# ------------------------------------------------------------------------------
resource "cloudflare_pages_project" "frontend" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.production_branch

  build_config = {
    build_caching       = false
    build_command       = "npm run build"
    destination_dir     = "dist"
    root_dir            = null
    web_analytics_tag   = null
    web_analytics_token = null
  }
}

# Custom domain for Pages (z.kaf.sh)
resource "cloudflare_pages_domain" "frontend_custom_domain" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.frontend.name
  name         = var.frontend_domain
}

# ------------------------------------------------------------------------------
# DNS Records
# ------------------------------------------------------------------------------

# CNAME for frontend domain (z.kaf.sh) pointing to Pages
resource "cloudflare_dns_record" "frontend" {
  zone_id = var.zone_id
  name    = var.frontend_domain
  content = "${cloudflare_pages_project.frontend.name}.pages.dev"
  type    = "CNAME"
  proxied = true
  ttl     = 1 # Auto TTL
  comment = "Maven repository frontend UI"
}

# Note: R2 custom domain (maven.kaf.sh) DNS is managed automatically by Cloudflare
