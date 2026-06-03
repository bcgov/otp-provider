output "target_group_arn" {
  description = "ALB Target Group ARN"
  value       = aws_alb_target_group.this.arn
}

output "alb_alerts_sns_topic_arn" {
  description = "SNS topic ARN for ALB alarm notifications (null when enable_alerts = false)"
  value       = one(aws_sns_topic.alb_alerts[*].arn)
}
