variable "name" {
  description = "Name of the app"
  type        = string
  default     = ""
}

variable "alb_listener_arn" {
  description = "ALB listener ARN"
  type        = string
  default     = ""
}

variable "alb_arn_suffix" {
  description = "ALB listener ARN suffix"
  type        = string
  default     = ""
}

variable "vpc_id" {
  description = "VPC id"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags"
  type        = map(string)
  default     = {}
}

variable "custom_domain_name" {
  description = "Custom domain name for the ALB listener rule"
  type        = string
  default     = ""
}

variable "listener_rule_priority" {
  description = "Priority for the ALB listener rule"
  type        = number
  default     = 100
}

variable "enable_alb_alarm" {
  description = "Create the ALB 5XX error-rate CloudWatch metric alarm"
  type        = bool
  default     = false
}

variable "enable_alerts" {
  description = "Enable SNS alerting for CloudWatch alarms"
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_alerts || var.enable_alb_alarm
    error_message = "enable_alerts = true requires enable_alb_alarm = true, since the SNS topic only has the ALB alarm wired to it."
  }
}

variable "alert_webhook_url" {
  description = "HTTPS webhook URL to receive CloudWatch alarm notifications via SNS"
  type        = string
  default     = ""
}
