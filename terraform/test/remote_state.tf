variable "tf_state_bucket_name" {
  description = "S3 bucket holding the otp-provider Terraform state files"
  type        = string
}

variable "tf_state_bucket_region" {
  description = "Region of the S3 bucket holding the otp-provider Terraform state files"
  type        = string
  default     = "ca-central-1"
}

# The tools state holds infrastructure shared across dev/test/prod/grafana:
# the shared VPC lookup, subnets, security groups and the shared ALB/listener.
data "terraform_remote_state" "tools" {
  backend = "s3"

  config = {
    bucket = var.tf_state_bucket_name
    key    = "otp-provider-tools.tfstate"
    region = var.tf_state_bucket_region
  }
}

locals {
  vpc_id             = data.terraform_remote_state.tools.outputs.vpc_id
  alb_listener_arn   = data.terraform_remote_state.tools.outputs.alb_listener_arn
  alb_arn_suffix     = data.terraform_remote_state.tools.outputs.alb_arn_suffix
  security_group_ids = [data.terraform_remote_state.tools.outputs.app_sg_id]
  subnet_ids         = [data.terraform_remote_state.tools.outputs.subnet_a_id, data.terraform_remote_state.tools.outputs.subnet_b_id]

  # Preserves the Environment/Application tags the old, single root module
  # used to merge in per-environment before the multi-state restructuring.
  tags = merge(var.tags, { Environment = "Test", Application = "OTP Provider" })
}
