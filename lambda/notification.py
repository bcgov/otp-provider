import json
import os
import boto3
import urllib3

http = urllib3.PoolManager()
secretsmanager = boto3.client("secretsmanager")

def lambda_handler(event, context):

    secret = secretsmanager.get_secret_value(
        SecretId=os.environ["MSTEAMS_OPS_WEBHOOK"]
    )

    webhook_url = json.loads(secret["SecretString"])["MSTEAMS_OPS_WEBHOOK"]

    detail = event.get("detail", {})

    service = detail.get("service")
    cluster = detail.get("clusterArn")
    reason = detail.get("reason", "Unknown")

    payload = {
        "title": "🚨 ECS Deployment Failed",
        "severity": "critical",
        "body": f"Service: {service}\nCluster: {cluster}\nReason: {reason}"
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
