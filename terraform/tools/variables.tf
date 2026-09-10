variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "ca-central-1"
}

variable "subnet_a" {
  type        = string
  description = "Value of the name tag for the app subnet in AZ a"
  default     = "Dev-App-A"
}

variable "subnet_b" {
  type        = string
  description = "Value of the name tag for the app subnet in AZ b"
  default     = "Dev-App-B"
}
