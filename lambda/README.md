# ECS Failure Notification Lambda

This AWS Lambda function receives Amazon ECS failure events from EventBridge and sends structured notifications to a Microsoft Teams webhook. The notification includes a link to the affected ECS service in the AWS console.

## Runtime behavior

The handler performs the following steps:

1. Parses the EventBridge event and builds a notification for a supported failure.
2. Reads the Microsoft Teams webhook URL from AWS Secrets Manager.
3. Validates that the webhook is a valid HTTPS URL.
4. Sends the notification with a 3-second connection timeout and a 10-second read timeout.
5. Raises secret retrieval, network, and non-2xx HTTP errors so EventBridge can retry the invocation.

Unsupported and non-failure events are ignored without retrieving the secret or calling the webhook.

## Handled scenarios

### ECS task failures

The task-state rule targets stopped tasks belonging to the configured ECS cluster and service. It handles these stop codes:

- `TaskFailedToStart`
- `EssentialContainerExited`

Notifications include the cluster ARN, task stop code, stopped reason, and available container details. Known exit codes include contextual hints for clean exits, generic failures, forced termination or out-of-memory failures, segmentation faults, and graceful termination.

### ECS service action failures

The service-action rule handles `WARN` and `ERROR` events for the configured ECS service, including:

- `SERVICE_TASK_PLACEMENT_FAILURE`
- `SERVICE_TASK_CONFIGURATION_FAILURE`
- `SERVICE_TASK_START_IMPAIRED`
- `SERVICE_DAEMON_PLACEMENT_CONSTRAINT_VIOLATED`
- `SERVICE_DISCOVERY_INSTANCE_UNHEALTHY`
- `ECS_OPERATION_THROTTLED`
- `SERVICE_DISCOVERY_OPERATION_THROTTLED`

### ECS deployment failures

The deployment-state rule handles `SERVICE_DEPLOYMENT_FAILED` for the configured ECS service. ECS emits this event when a deployment fails and the ECS deployment circuit breaker is enabled.

## Environment variables

| Variable              | Required | Description                                                                      |
| --------------------- | -------- | -------------------------------------------------------------------------------- |
| `MSTEAMS_OPS_WEBHOOK` | Yes      | AWS Secrets Manager secret name or full ARN. This is not the webhook URL itself. |
| `ECS_SERVICE_URL`     | Yes      | AWS console URL for the monitored ECS service, included in notifications.        |
| `LOG_LEVEL`           | No       | Python logging level. Defaults to `INFO`.                                        |

Lambda automatically provides AWS runtime variables such as `AWS_REGION`; they do not need to be configured by this module.

The referenced Secrets Manager secret must contain a JSON `SecretString` with this structure:

```json
{
  "MSTEAMS_OPS_WEBHOOK": "https://example.webhook.office.com/path"
}
```

The Lambda execution role must allow `secretsmanager:GetSecretValue` for that secret and standard CloudWatch Logs actions.

## Deployed components

The Terraform Lambda module deploys:

- One Python 3.12 Lambda function with a 30-second execution timeout.
- Three EventBridge rules for task, service-action, and deployment failures.
- One Lambda target for each EventBridge rule.
- One resource-based Lambda invoke permission for each EventBridge rule.
- Lambda environment variables for the secret identifier and ECS service URL.

The module receives the Lambda execution role ARN from the IAM module. The IAM module creates the role and grants access to the configured secret and CloudWatch Logs.

The GitHub Actions Terraform workflow builds `terraform/lambda.zip` from `notification.py` and hash-pinned wheel dependencies in `requirements.txt`. Dependencies are installed into a clean staging directory with `--require-hashes`, `--only-binary=:all:`, and no pip cache.

## Running tests

The test suite uses Python's standard `unittest` library and mocks Secrets Manager and outbound HTTP calls. It does not access AWS or send Microsoft Teams messages.

From the repository root:

```bash
cd lambda
python3 -m unittest -v test_notification.py
```

Alternatively, while already in the `lambda` directory:

```bash
python3 test_notification.py
```

The tests cover:

- Stopped tasks and failed-to-start tasks.
- Clean and non-zero container exits.
- Service action warnings and errors.
- Deployment failures.
- Unsupported and non-failure events.
- Missing environment configuration.
- Secrets Manager failures and malformed secret values.
- Invalid and non-HTTPS webhook URLs.
- Webhook timeouts and non-2xx responses.
- Successful webhook delivery.

## Delivery semantics

EventBridge invokes Lambda asynchronously and uses at-least-once delivery. The handler raises delivery failures so EventBridge can retry them, but a retry can produce a duplicate notification if the webhook accepted a request and its response was lost. Configure an EventBridge target dead-letter queue if failed events must be retained after retries are exhausted.
