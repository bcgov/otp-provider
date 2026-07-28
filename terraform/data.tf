data "aws_vpc" "selected" {
  state = "available"
}

data "aws_subnet" "a" {
  filter {
    name   = "tag:Name"
    values = [var.subnet_a]
  }
}

data "aws_subnet" "b" {
  filter {
    name   = "tag:Name"
    values = [var.subnet_b]
  }
}

data "aws_security_group" "web_sg" {
  filter {
    name   = "tag:Name"
    values = ["Web"]
  }

  vpc_id = data.aws_vpc.selected.id
}

data "aws_security_group" "app_sg" {
  filter {
    name   = "tag:Name"
    values = ["App"]
  }

  vpc_id = data.aws_vpc.selected.id
}
