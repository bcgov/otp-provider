import importlib
import json
import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("AWS_DEFAULT_REGION", "ca-central-1")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


def _load_notification_module():
    if "notification" in sys.modules:
        return sys.modules["notification"]

    try:
        return importlib.import_module("notification")
    except ModuleNotFoundError as error:
        if error.name not in {"boto3", "botocore", "urllib3"}:
            raise

    boto3 = types.ModuleType("boto3")
    boto3.client = Mock(return_value=Mock())
    botocore = types.ModuleType("botocore")
    botocore_config = types.ModuleType("botocore.config")
    botocore_config.Config = Mock(return_value=Mock())
    urllib3 = types.ModuleType("urllib3")
    urllib3.Timeout = Mock(return_value=Mock())
    urllib3.PoolManager = Mock(return_value=Mock())

    with patch.dict(
        sys.modules,
        {
            "boto3": boto3,
            "botocore": botocore,
            "botocore.config": botocore_config,
            "urllib3": urllib3,
        },
    ):
        return importlib.import_module("notification")


notification = _load_notification_module()

CLUSTER_ARN = "arn:aws:ecs:ca-central-1:123456789012:cluster/otp-provider-prod"
SERVICE_ARN = (
    "arn:aws:ecs:ca-central-1:123456789012:service/"
    "otp-provider-prod/otp-provider-prod"
)


def task_failed_event(exit_code=1, reason="Application exited"):
    return {
        "version": "0",
        "detail-type": "ECS Task State Change",
        "source": "aws.ecs",
        "resources": [
            "arn:aws:ecs:ca-central-1:123456789012:task/otp-provider-prod/task-id"
        ],
        "detail": {
            "clusterArn": CLUSTER_ARN,
            "group": "service:otp-provider-prod",
            "lastStatus": "STOPPED",
            "stopCode": "EssentialContainerExited",
            "stoppedReason": "Essential container in task exited",
            "containers": [
                {
                    "name": "otp-provider-prod",
                    "image": "ghcr.io/bcgov/otp-provider:test",
                    "lastStatus": "STOPPED",
                    "exitCode": exit_code,
                    "reason": reason,
                }
            ],
        },
    }


def service_action_event(event_type="ERROR"):
    return {
        "version": "0",
        "detail-type": "ECS Service Action",
        "source": "aws.ecs",
        "resources": [SERVICE_ARN],
        "detail": {
            "eventType": event_type,
            "eventName": "SERVICE_TASK_PLACEMENT_FAILURE",
            "clusterArn": CLUSTER_ARN,
            "reason": "No Fargate Spot capacity was available.",
            "containerInstanceArns": [],
        },
    }


def deployment_failed_event(event_type="ERROR"):
    return {
        "version": "0",
        "detail-type": "ECS Deployment State Change",
        "source": "aws.ecs",
        "resources": [SERVICE_ARN],
        "detail": {
            "eventType": event_type,
            "eventName": "SERVICE_DEPLOYMENT_FAILED",
            "deploymentId": "ecs-svc/1234567890",
            "reason": "ECS deployment circuit breaker: task failed to start.",
        },
    }


class BuildNotificationTests(unittest.TestCase):
    def setUp(self):
        self.service_url = "https://console.aws.amazon.com/ecs/service"

    def test_task_failure_includes_container_details(self):
        payload = notification.build_notification(task_failed_event(), self.service_url)

        self.assertIsNotNone(payload)
        self.assertIn("EssentialContainerExited", payload.message)
        self.assertIn('"exitCode": 1', payload.message)
        self.assertIn("Generic application error", payload.message)

    def test_clean_exit_of_service_container_is_reported(self):
        payload = notification.build_notification(
            task_failed_event(exit_code=0, reason=None), self.service_url
        )

        self.assertIsNotNone(payload)
        self.assertIn('"exitCode": 0', payload.message)
        self.assertIn("Exited cleanly", payload.message)

    def test_task_failed_to_start_without_exit_code_is_reported_from_reason(self):
        event = task_failed_event(exit_code=None, reason="CannotPullContainerError")
        event["detail"]["stopCode"] = "TaskFailedToStart"

        payload = notification.build_notification(event, self.service_url)

        self.assertIsNotNone(payload)
        self.assertIn("CannotPullContainerError", payload.message)

    def test_service_action_error_builds_notification(self):
        payload = notification.build_notification(
            service_action_event(), self.service_url
        )

        self.assertIsNotNone(payload)
        self.assertIn("SERVICE_TASK_PLACEMENT_FAILURE", payload.message)

    def test_service_action_info_is_ignored(self):
        self.assertIsNone(
            notification.build_notification(
                service_action_event(event_type="INFO"), self.service_url
            )
        )

    def test_deployment_failure_builds_notification(self):
        payload = notification.build_notification(
            deployment_failed_event(), self.service_url
        )

        self.assertIsNotNone(payload)
        self.assertIn("SERVICE_DEPLOYMENT_FAILED", payload.message)
        self.assertIn("ecs-svc/1234567890", payload.message)

    def test_non_failure_deployment_is_ignored(self):
        self.assertIsNone(
            notification.build_notification(
                deployment_failed_event(event_type="INFO"), self.service_url
            )
        )

    def test_running_task_is_ignored(self):
        event = task_failed_event()
        event["detail"]["lastStatus"] = "RUNNING"

        self.assertIsNone(notification.build_notification(event, self.service_url))

    def test_unknown_event_is_ignored(self):
        self.assertIsNone(notification.build_notification({}, self.service_url))


class LambdaHandlerTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "ECS_SERVICE_URL": "https://console.aws.amazon.com/ecs/service",
                "MSTEAMS_OPS_WEBHOOK": "secret-arn",
            },
            clear=True,
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

        notification.secretsmanager = Mock()
        notification.secretsmanager.get_secret_value.return_value = {
            "SecretString": json.dumps(
                {"MSTEAMS_OPS_WEBHOOK": "https://example.webhook.office.com/hook"}
            )
        }
        notification.http = Mock()
        notification.http.request.return_value = Mock(status=202)

    def test_handler_posts_notification(self):
        result = notification.lambda_handler(deployment_failed_event(), None)

        self.assertEqual({"statusCode": 202, "body": "Notification sent"}, result)
        notification.http.request.assert_called_once()
        request = notification.http.request.call_args
        self.assertEqual("POST", request.args[0])
        self.assertFalse(request.kwargs["retries"])

    def test_handler_does_not_fetch_secret_for_ignored_event(self):
        result = notification.lambda_handler({}, None)

        self.assertEqual({"statusCode": 204, "body": "Event ignored"}, result)
        notification.secretsmanager.get_secret_value.assert_not_called()
        notification.http.request.assert_not_called()

    def test_missing_service_url_raises(self):
        del os.environ["ECS_SERVICE_URL"]

        with self.assertRaises(KeyError):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_secret_manager_failure_is_raised_for_eventbridge_retry(self):
        notification.secretsmanager.get_secret_value.side_effect = RuntimeError(
            "Secrets Manager unavailable"
        )

        with self.assertRaisesRegex(RuntimeError, "Secrets Manager unavailable"):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_invalid_secret_json_is_raised(self):
        notification.secretsmanager.get_secret_value.return_value = {
            "SecretString": "not-json"
        }

        with self.assertRaises(json.JSONDecodeError):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_missing_webhook_key_is_raised(self):
        notification.secretsmanager.get_secret_value.return_value = {
            "SecretString": "{}"
        }

        with self.assertRaisesRegex(ValueError, "valid HTTPS URL"):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_non_https_webhook_is_rejected(self):
        notification.secretsmanager.get_secret_value.return_value = {
            "SecretString": json.dumps(
                {"MSTEAMS_OPS_WEBHOOK": "http://example.com/hook"}
            )
        }

        with self.assertRaisesRegex(ValueError, "valid HTTPS URL"):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_webhook_timeout_is_raised_for_eventbridge_retry(self):
        notification.http.request.side_effect = TimeoutError("timed out")

        with self.assertRaisesRegex(TimeoutError, "timed out"):
            notification.lambda_handler(deployment_failed_event(), None)

    def test_non_success_webhook_response_is_raised(self):
        notification.http.request.return_value = Mock(status=500)

        with self.assertRaisesRegex(RuntimeError, "HTTP 500"):
            notification.lambda_handler(deployment_failed_event(), None)


if __name__ == "__main__":
    unittest.main()
