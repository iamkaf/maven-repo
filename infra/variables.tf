variable "cloudflare_api_token" {
  description = "Cloudflare API token with permissions for Workers, R2, Pages, and DNS"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "domain" {
  description = "Domain name for the Maven repository (R2 artifacts)"
  type        = string
  default     = "maven.kaf.sh"
}

variable "frontend_domain" {
  description = "Domain name for the frontend UI (Pages)"
  type        = string
  default     = "z.kaf.sh"
}

variable "zone_id" {
  description = "Cloudflare Zone ID for the domain (required for DNS records)"
  type        = string
}

variable "r2_bucket_name" {
  description = "Name of the R2 bucket for artifact storage"
  type        = string
  default     = "maven-kaf-sh-artifacts"
}

variable "worker_name" {
  description = "Name of the Cloudflare Worker"
  type        = string
  default     = "maven-metadata-api"
}

variable "pages_project_name" {
  description = "Name of the Cloudflare Pages project"
  type        = string
  default     = "maven-repo-frontend"
}

variable "production_branch" {
  description = "Git branch to auto-deploy for production"
  type        = string
  default     = "main"
}
