variable "name" {
  description = "The name prefix for the Lambda function"
  type        = string
}

variable "lambda_zip" {
  description = "The path to the Lambda deployment package zip file"
  type        = string
}

variable "lambda_role_arn" {
  description = "ARN of the IAM role assumed by the Lambda function"
  type        = string
}

variable "msteams_ops_webhook_secret_arn" {
  description = "ARN of the Secrets Manager secret containing MSTEAMS_OPS_WEBHOOK"
  type        = string
}

variable "ecs_service_url" {
  description = "URL of the ECS service"
  type        = string
}
