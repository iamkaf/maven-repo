output "r2_bucket_name" {
  description = "Name of the R2 bucket"
  value       = cloudflare_r2_bucket.artifacts.name
}

output "r2_bucket_id" {
  description = "ID of the R2 bucket"
  value       = cloudflare_r2_bucket.artifacts.id
}

output "r2_custom_domain" {
  description = "R2 custom domain for Maven artifacts"
  value       = var.domain
}

output "worker_id" {
  description = "ID of the Cloudflare Worker (managed via wrangler)"
  value       = var.worker_name
}

output "worker_url" {
  description = "URL of the Worker API"
  value       = "https://${var.domain}/api"
}

output "pages_project_name" {
  description = "Name of the Pages project"
  value       = cloudflare_pages_project.frontend.name
}

output "pages_url" {
  description = "URL of the Pages frontend (dev domain)"
  value       = "https://${cloudflare_pages_project.frontend.name}.pages.dev"
}

output "frontend_domain" {
  description = "Custom domain for the frontend UI"
  value       = var.frontend_domain
}

output "maven_repository_url" {
  description = "URL to use in Maven/Gradle builds"
  value       = "https://${var.domain}"
}

# Note: R2 write tokens must be created manually in the Cloudflare dashboard
# Go to: https://dash.cloudflare.com/profile/api-tokens
# Required permissions: Workers R2 Storage:Edit
