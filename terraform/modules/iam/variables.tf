variable "name" {
  description = "Name prefix used for the IAM roles/policies created by this module (e.g. otp-provider-dev)"
  type        = string
}

variable "tags" {
  description = "Tags"
  type        = map(string)
  default     = {}
}

variable "secret_arn" {
  description = "ARN of the Secrets Manager secret the ECS task execution role is allowed to read"
  type        = string
}

variable "enable_ses_send_email" {
  description = "Attach an SES send-email policy to the task role"
  type        = bool
  default     = true
}
