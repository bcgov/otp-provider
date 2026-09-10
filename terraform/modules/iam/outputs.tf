output "task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.task_execution_role.arn
}

output "task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.task_role.arn
}

output "msteams_notifier_role_arn" {
  description = "ARN of the Microsoft Teams notifier Lambda role"
  value       = aws_iam_role.msteams_notifier.arn
}
