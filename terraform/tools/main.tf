locals {
  name = "otp-provider"
}

resource "aws_alb" "otp_provider_alb" {

  name                             = "${local.name}-alb"
  internal                         = true
  security_groups                  = [data.aws_security_group.web_sg.id]
  subnets                          = [data.aws_subnet.a.id, data.aws_subnet.b.id]
  enable_cross_zone_load_balancing = true

  lifecycle {
    ignore_changes = [access_logs]
  }
}

resource "aws_alb_listener" "otp_provider_alb_listener" {
  load_balancer_arn = aws_alb.otp_provider_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}
