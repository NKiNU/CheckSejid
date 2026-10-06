#!/usr/bin/env bash
# `aws s3 …` against the configured Space, without installing the AWS CLI on the Droplet. Needs the S3_* vars
# from .env in the environment (the other ops scripts load it).
set -euo pipefail
exec docker run --rm -i --network host \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  amazon/aws-cli --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" s3 "$@"
