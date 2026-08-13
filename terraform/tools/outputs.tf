output "vpc_id" {
  description = "ID of the shared VPC"
  value       = data.aws_vpc.selected.id
}

output "subnet_a_id" {
  description = "ID of the app subnet in AZ a"
  value       = data.aws_subnet.a.id
}

output "subnet_b_id" {
  description = "ID of the app subnet in AZ b"
  value       = data.aws_subnet.b.id
}

output "web_sg_id" {
  description = "ID of the Web security group"
  value       = data.aws_security_group.web_sg.id
}

output "app_sg_id" {
  description = "ID of the App security group"
  value       = data.aws_security_group.app_sg.id
}

output "alb_arn" {
  description = "ARN of the shared OTP Provider ALB"
  value       = aws_alb.otp_provider_alb.arn
}

output "alb_arn_suffix" {
  description = "ARN suffix of the shared OTP Provider ALB (used for CloudWatch metrics)"
  value       = aws_alb.otp_provider_alb.arn_suffix
}

output "alb_listener_arn" {
  description = "ARN of the shared OTP Provider ALB HTTP listener"
  value       = aws_alb_listener.otp_provider_alb_listener.arn
}
