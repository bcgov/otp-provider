data "aws_iam_policy_document" "assume_role" {
  version = "2012-10-17"
  statement {
    sid     = ""
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution_role" {
  name               = "${var.name}-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "task_execution_role_policy_attachment" {
  role       = aws_iam_role.task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task_role" {
  name               = "${var.name}-task-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

resource "aws_iam_policy" "ses_send_email" {
  count       = var.enable_ses_send_email ? 1 : 0
  name        = "${var.name}-ses-send-email-policy"
  description = "Allow sending email via Amazon SES from ECS tasks"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSesSend"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_role_attach_ses" {
  count      = var.enable_ses_send_email ? 1 : 0
  role       = aws_iam_role.task_role.name
  policy_arn = aws_iam_policy.ses_send_email[0].arn
}

resource "aws_iam_role_policy" "task_execution_cwlogs" {
  name = "${var.name}-logs-policy"
  role = aws_iam_role.task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:*:*:*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_read_secret_policy" {
  name = "${var.name}-read-secret-policy"
  role = aws_iam_role.task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.secret_arn
        ]
      }
    ]
  })
}
