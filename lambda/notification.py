import json
import os
import boto3
import urllib3
from botocore.config import Config

http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=3.0, read=10.0))
secretsmanager = boto3.client(
    "secretsmanager",
    config=Config(connect_timeout=3, read_timeout=10, retries={"max_attempts": 2}),
)

def lambda_handler(event, context):

    secret = secretsmanager.get_secret_value(
        SecretId=os.environ["MSTEAMS_OPS_WEBHOOK"]
    )

    webhook_url = json.loads(secret["SecretString"])["MSTEAMS_OPS_WEBHOOK"]

    detail = event.get("detail", {})

    service = detail.get("service")
    cluster = detail.get("clusterArn")
    reason = detail.get("reason", "Unknown")
    ecs_service_url = os.environ["ECS_SERVICE_URL"]

    payload = {
        "projectName": "OTP Provider Deployment Failed",
        "severity": "critical",
        "message": f"Cluster: {cluster}\nService: {service}\nReason: {reason}",
        "url": ecs_service_url
    }

    response = http.request(
        "POST",
        webhook_url,
        body=json.dumps(payload),
        headers={"Content-Type": "application/json"}
    )

    return {
        "statusCode": response.status,
        "body": "Notification sent"
    }
