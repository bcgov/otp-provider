resource "aws_lambda_function" "ecs_failure_notifier" {
  filename         = var.lambda_zip
  source_code_hash = filebase64sha256(var.lambda_zip)
  function_name    = "${var.name}-teams-notifier"
  role             = var.lambda_role_arn
  handler          = "notification.lambda_handler"
  runtime          = "python3.12"
  timeout          = 30

  environment {
    variables = {
      MSTEAMS_OPS_WEBHOOK = var.msteams_ops_webhook_secret_arn
    }
  }
}


resource "aws_cloudwatch_event_rule" "ecs_deployment_failed" {
  name = "${var.name}-deployment-failed"

  event_pattern = jsonencode({
    source = ["aws.ecs"]
    detail-type = [
      "ECS Service Deployment State Change"
    ]
    detail = {
      eventName = [
        "SERVICE_DEPLOYMENT_FAILED"
      ]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_failure_lambda" {
  rule = aws_cloudwatch_event_rule.ecs_deployment_failed.name
  arn  = aws_lambda_function.ecs_failure_notifier.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ecs_failure_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_deployment_failed.arn
}
