locals {
  grafana_name = "grafana"
  grafana_tags = merge(
    var.tags,
    {
      Application = "Grafana"
    }
  )
}

resource "aws_alb_target_group" "grafana_target_group" {
  name        = local.grafana_name
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
  tags = local.grafana_tags
}

resource "aws_lb_listener_rule" "grafana_listener_rule" {
  listener_arn = local.alb_listener_arn
  priority     = 7

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.grafana_target_group.arn
  }

  condition {
    host_header {
      values = [var.custom_domain_name]
    }
  }

  condition {
    path_pattern {
      values = ["/grafana/*"]
    }
  }
}

resource "aws_apigatewayv2_integration" "grafana" {
  api_id             = local.prod_api_gateway_id
  integration_type   = "HTTP_PROXY"
  connection_id      = local.prod_api_gateway_vpc_link_id
  connection_type    = "VPC_LINK"
  integration_method = "ANY"
  integration_uri    = local.alb_listener_arn
}

resource "aws_apigatewayv2_route" "grafana" {
  api_id    = local.prod_api_gateway_id
  route_key = "ANY /grafana/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.grafana.id}"
}

resource "aws_efs_file_system" "grafana" {
  creation_token = "grafana"
  encrypted      = true
}

resource "aws_efs_mount_target" "efs_sso_grafana_azA" {
  file_system_id  = aws_efs_file_system.grafana.id
  subnet_id       = local.subnet_ids[0]
  security_groups = local.security_group_ids
}

resource "aws_efs_mount_target" "efs_sso_grafana_azB" {
  file_system_id  = aws_efs_file_system.grafana.id
  subnet_id       = local.subnet_ids[1]
  security_groups = local.security_group_ids
}

resource "aws_efs_access_point" "grafana" {
  file_system_id = aws_efs_file_system.grafana.id

  root_directory {
    creation_info {
      owner_uid   = "0"
      owner_gid   = "0"
      permissions = "0777"
    }

    path = "/grafana"
  }
}

resource "aws_ecs_cluster" "grafana" {
  name = local.grafana_name
}

resource "aws_ecs_task_definition" "grafana" {
  family                   = local.grafana_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # This is a lightweight image so running the minimum allowed fargate container
  cpu    = "256"
  memory = "512"

  execution_role_arn = aws_iam_role.grafana_task_execution.arn
  task_role_arn      = aws_iam_role.grafana_task_role.arn

  container_definitions = jsonencode([
    {
      name      = local.grafana_name
      image     = "grafana/grafana:latest"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      mountPoints = [
        {
          sourceVolume  = "efs-volume"
          containerPath = "/var/lib/grafana"
          readOnly      = false
        }
      ]
      environment = [
        {
          name  = "GF_SERVER_ROOT_URL"
          value = "https://${var.custom_domain_name}/grafana/"
        },
        {
          name  = "GF_SERVER_SERVE_FROM_SUB_PATH"
          value = "true"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_NAME",
          value = "SSO Pathfinder${var.grafana_env == "development" ? " Sandbox" : ""}"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_ENABLED",
          value = "true"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_AUTH_URL",
          value = "${var.grafana_kc_url}/auth/realms/standard/protocol/openid-connect/auth"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_API_URL",
          value = "${var.grafana_kc_url}/auth/realms/standard/protocol/openid-connect/userinfo"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH",
          value = "preferred_username"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH",
          value = "contains(client_roles[*], 'grafanaadmin') && 'GrafanaAdmin' || contains(client_roles[*], 'admin') && 'Admin' || contains(client_roles[*], 'editor') && 'Editor'"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_TOKEN_URL",
          value = "${var.grafana_kc_url}/auth/realms/standard/protocol/openid-connect/token"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_SCOPES",
          value = "openid"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_EMPTY_SCOPES",
          value = "false"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_USE_PKCE",
          value = "true"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_EMAIL_ATTRIBUTE_PATH",
          value = "email"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_NAME_ATTRIBUTE_PATH",
          value = "display_name"
        },
        {
          name  = "GF_AUTH_OAUTH_ALLOW_INSECURE_EMAIL_LOOKUP",
          value = "true"
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_CLIENT_ID",
          value = var.grafana_kc_client_id
        },
        {
          name  = "GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET",
          value = var.grafana_kc_client_secret
        },
        {
          name  = "GF_AUTH_DISABLE_LOGIN_FORM",
          value = "true"
        },
      ]
    }
  ])

  volume {
    name = "efs-volume"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.grafana.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.grafana.id
        iam             = "ENABLED"
      }
    }
  }
}

resource "aws_ecs_service" "grafana" {
  name            = local.grafana_name
  cluster         = aws_ecs_cluster.grafana.id
  task_definition = aws_ecs_task_definition.grafana.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = local.security_group_ids
    subnets          = local.subnet_ids
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.grafana_target_group.arn
    container_name   = local.grafana_name
    container_port   = 3000
  }
}
