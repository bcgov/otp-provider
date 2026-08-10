# This file is overwritten by the terraform.yml GitHub Actions workflow to
# inject the S3 backend configuration (bucket/key/region) for this env.
# See docs/terraform-state-migration.md for manual backend configuration.
terraform {
  backend "s3" {}
}
