from dataclasses import dataclass
import json
import logging
import os
from urllib.parse import urlparse

import boto3
import urllib3
from botocore.config import Config

LOG = logging.getLogger()
LOG.setLevel(os.getenv("LOG_LEVEL", "INFO"))

http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=3.0, read=10.0))
secretsmanager = boto3.client(
    "secretsmanager",
    config=Config(connect_timeout=3, read_timeout=10, retries={"max_attempts": 2}),
)

_EXIT_CODE_HINTS = {
    0: "Exited cleanly (0). For a long-running service this still means the "
       "process terminated when it should not have.",
    1: "Generic application error (1). Check application logs.",
    137: "SIGKILL (137). Either the OOM killer, or the container ignored SIGTERM "
         "and was force-killed after stopTimeout.",
    139: "SIGSEGV (139). Native segfault in the process.",
    143: "SIGTERM (143). Graceful shutdown signal, normal during deploys.",
}

@dataclass
class Notification:
    """Represents a notification to be sent to Microsoft Teams."""
    project_name: str
    severity: str
    message: str
    url: str

    def to_dict(self):
        return {
            "projectName": self.project_name,
            "severity": self.severity,
            "message": self.message,
            "url": self.url
        }

    def to_json(self):
        return json.dumps(self.to_dict())

def build_notification(event, ecs_service_url):
    detail_type = event.get("detail-type", "Unknown")
    detail = event.get("detail", {})

    if detail_type == "ECS Task State Change":
        LOG.info("ECS Task State Change event received.")
        last_status = detail.get("lastStatus", "Unknown")
        if last_status == "STOPPED":
            LOG.info("Task has stopped, processing failed containers.")
            stop_code = detail.get("stopCode", "Unknown")
            stopped_reason = detail.get("stoppedReason", "Unknown")
            containers = detail.get("containers", [])

            failed_containers = []

            for container in containers:
                exit_code = container.get("exitCode")
                reason = container.get("reason")
                if reason or exit_code is not None:
                    failed_containers.append({
                        "name": container.get("name", "Unknown"),
                        "image": container.get("image", "Unknown"),
                        "exitCode": exit_code,
                        "reason": reason or "Unknown",
                        "last_status": last_status,
                        "exit_code_hint": _EXIT_CODE_HINTS.get(exit_code, "Unknown exit code")
                    })

            if failed_containers:
                LOG.info("Failed containers detected, preparing notification.")
                return Notification(
                    project_name="OTP Provider Deployment Failed",
                    severity="critical",
                    message=f"Cluster: {detail.get('clusterArn', 'Unknown')}\nStop Code: {stop_code}\nReason: {stopped_reason}\nFailed Containers: {json.dumps(failed_containers, indent=2)}",
                    url=ecs_service_url
                )
    elif detail_type == "ECS Service Action":
        LOG.info("ECS Service Action event received.")
        event_type = detail.get("eventType", "Unknown")
        if event_type in {"WARN", "ERROR"}:
            LOG.info("Service deployment failure detected.")
            return Notification(
                project_name="OTP Provider Deployment Failed",
                severity="critical",
                message=f"Cluster: {detail.get('clusterArn', 'Unknown')}\nEvent Name: {detail.get('eventName', 'Unknown')}\nEvent Type: {event_type}\nReason: {detail.get('reason', 'Unknown')}\nContainers: {json.dumps(detail.get('containerInstanceArns', []), indent=2)}",
                url=ecs_service_url
            )
    elif detail_type == "ECS Deployment State Change":
        LOG.info("ECS Deployment State Change event received.")
        event_type = detail.get("eventType", "Unknown")
        if event_type == "ERROR":
            LOG.info("Deployment state change detected.")
            return Notification(
                project_name="OTP Provider Deployment Failed",
                severity="critical",
                message=f"Event Name: {detail.get('eventName', 'Unknown')}\nEvent Type: {event_type}\nReason: {detail.get('reason', 'Unknown')}\nDeployment ID: {detail.get('deploymentId', 'Unknown')}",
                url=ecs_service_url
            )

    LOG.warning("Ignoring unsupported or non-failure ECS event: %s", detail_type)
    return None


def get_webhook_url():
    secret_id = os.environ["MSTEAMS_OPS_WEBHOOK"]
    secret = secretsmanager.get_secret_value(SecretId=secret_id)
    secret_string = secret.get("SecretString")
    if not secret_string:
        raise ValueError("Webhook secret must contain SecretString")

    webhook_url = json.loads(secret_string).get("MSTEAMS_OPS_WEBHOOK")
    parsed_url = urlparse(webhook_url or "")
    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise ValueError("MSTEAMS_OPS_WEBHOOK must be a valid HTTPS URL")
    return webhook_url


def lambda_handler(event, context):
    ecs_service_url = os.environ["ECS_SERVICE_URL"]
    payload = build_notification(event, ecs_service_url)
    if payload is None:
        return {"statusCode": 204, "body": "Event ignored"}

    try:
        response = http.request(
            "POST",
            get_webhook_url(),
            body=payload.to_json(),
            headers={"Content-Type": "application/json"},
            retries=False,
        )
        if not 200 <= response.status < 300:
            raise RuntimeError(f"Webhook returned HTTP {response.status}")
    except Exception:
        LOG.exception("Failed to send notification")
        raise

    return {
        "statusCode": response.status,
        "body": "Notification sent"
    }
