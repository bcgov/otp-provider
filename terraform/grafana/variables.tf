variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "ca-central-1"
}

variable "tags" {
  description = "Tags"
  type        = map(string)
  default = {
    ManagedBy        = "Terraform"
    TerraformVersion = "1.11.0"
  }
}

variable "custom_domain_name" {
  description = "Custom domain name Grafana is hosted under (the prod custom domain, since Grafana is routed via /grafana/* on the prod API Gateway)"
  type        = string
  default     = ""
}

variable "grafana_env" {
  description = "Grafana environment"
  type        = string
  default     = "development"
}

variable "grafana_kc_url" {
  description = "Grafana keycloak base URL"
  type        = string
  default     = ""
}

variable "grafana_kc_client_id" {
  description = "Grafana keycloak client ID"
  type        = string
  default     = ""
}

variable "grafana_kc_client_secret" {
  description = "Grafana keycloak client secret"
  type        = string
  default     = ""
}
