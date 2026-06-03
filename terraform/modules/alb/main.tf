

resource "aws_alb_target_group" "this" {
  name                 = var.name
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    healthy_threshold   = "2"
    interval            = "5"
    protocol            = "HTTP"
    matcher             = "200"
    timeout             = "3"
    path                = "/.well-known/openid-configuration"
    unhealthy_threshold = "2"
  }
  tags = var.tags
}

resource "aws_lb_listener_rule" "this" {
  listener_arn = var.alb_listener_arn
  priority     = var.listener_rule_priority

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.this.arn
  }

  condition {
    host_header {
      values = [var.custom_domain_name]
    }
  }
}

resource "aws_sns_topic" "alb_alerts" {
  count = var.enable_alerts ? 1 : 0
  name  = "${var.name}-alb-alerts"
  tags  = var.tags
}

resource "aws_sns_topic_subscription" "alb_alerts_webhook" {
  count                = var.enable_alerts ? 1 : 0
  topic_arn            = aws_sns_topic.alb_alerts[0].arn
  protocol             = "https"
  endpoint             = var.alert_webhook_url
  raw_message_delivery = true
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  count               = var.enable_alb_alarm ? 1 : 0
  alarm_name          = "${var.name}-alb-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 2
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_description = "5XX error rate > 5%"
  alarm_actions     = compact([one(aws_sns_topic.alb_alerts[*].arn)])

  metric_query {
    id = "m1"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 60
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = aws_alb_target_group.this.arn_suffix
      }
    }
  }

  metric_query {
    id = "m2"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = aws_alb_target_group.this.arn_suffix
      }
    }
  }

  metric_query {
    id          = "e1"
    expression  = "IF(m2 > 0, 100 * m1 / m2, 0)"
    label       = "error_rate"
    return_data = true
  }
}
