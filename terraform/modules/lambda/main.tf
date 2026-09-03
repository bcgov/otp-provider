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
      ECS_SERVICE_URL     = var.ecs_service_url
    }
  }
}


resource "aws_cloudwatch_event_rule" "ecs_deployment_failed" {
  name = "${var.name}-deployment-failed"

  event_pattern = jsonencode({
    source = ["aws.ecs"]
    detail-type = [
      "ECS Deployment State Change"
    ]
    resources = [var.ecs_service_arn]
    detail = {
      eventName = [
        "SERVICE_DEPLOYMENT_FAILED"
      ]
    }
  })
}

# stopCode limits matches to genuine task failures, excluding scale-in and user-initiated stops.
resource "aws_cloudwatch_event_rule" "ecs_task_failed" {
  name = "${var.name}-task-failed"

  event_pattern = jsonencode({
    source = ["aws.ecs"]
    detail-type = [
      "ECS Task State Change",
    ]
    detail = {
      lastStatus = ["STOPPED"]
      clusterArn = [var.ecs_cluster_arn]
      group      = ["service:${var.ecs_service_name}"]
      stopCode = [
        "TaskFailedToStart",
        "EssentialContainerExited"
      ]
    }
  })
}

resource "aws_cloudwatch_event_rule" "ecs_service_action_failed" {
  name = "${var.name}-service-action-failed"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Service Action"]
    resources   = [var.ecs_service_arn]
    detail = {
      eventType = ["WARN", "ERROR"]
      eventName = [
        "SERVICE_TASK_PLACEMENT_FAILURE",
        "SERVICE_TASK_CONFIGURATION_FAILURE",
        "SERVICE_TASK_START_IMPAIRED",
        "SERVICE_DAEMON_PLACEMENT_CONSTRAINT_VIOLATED",
        "SERVICE_DISCOVERY_INSTANCE_UNHEALTHY",
        "ECS_OPERATION_THROTTLED",
        "SERVICE_DISCOVERY_OPERATION_THROTTLED"
      ]
      clusterArn = [var.ecs_cluster_arn]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_failure_lambda" {
  rule = aws_cloudwatch_event_rule.ecs_deployment_failed.name
  arn  = aws_lambda_function.ecs_failure_notifier.arn
}

resource "aws_cloudwatch_event_target" "ecs_task_failure_lambda" {
  rule = aws_cloudwatch_event_rule.ecs_task_failed.name
  arn  = aws_lambda_function.ecs_failure_notifier.arn
}

resource "aws_cloudwatch_event_target" "ecs_service_action_failure_lambda" {
  rule = aws_cloudwatch_event_rule.ecs_service_action_failed.name
  arn  = aws_lambda_function.ecs_failure_notifier.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ecs_failure_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_deployment_failed.arn
}

resource "aws_lambda_permission" "allow_eventbridge_task_failure" {
  statement_id  = "AllowExecutionFromEventBridgeTaskFailure"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ecs_failure_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_task_failed.arn
}

resource "aws_lambda_permission" "allow_eventbridge_service_action_failure" {
  statement_id  = "AllowExecutionFromEventBridgeServiceActionFailure"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ecs_failure_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_service_action_failed.arn
}
