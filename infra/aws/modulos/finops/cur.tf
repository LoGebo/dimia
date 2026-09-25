# CUR 2.0 (§6.2): export horario con recursos y split cost allocation de EKS, en Parquet,
# consultable con Athena con tope de 1 GB por consulta.

resource "aws_s3_bucket" "cur" {
  #checkov:skip=CKV_AWS_18:Datos de facturación sin PII; los accesos quedan en CloudTrail de la organización.
  #checkov:skip=CKV_AWS_144:El export se puede regenerar desde AWS; no hace falta réplica entre regiones.
  #checkov:skip=CKV_AWS_145:Data Exports entrega con SSE-S3; datos de facturación sin PII.
  #checkov:skip=CKV2_AWS_62:Nadie consume eventos del bucket; Athena lee bajo demanda.
  bucket = "dimia-cur-${local.cuenta}"
}

resource "aws_s3_bucket_ownership_controls" "cur" {
  bucket = aws_s3_bucket.cur.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "cur" {
  bucket                  = aws_s3_bucket.cur.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cur" {
  bucket = aws_s3_bucket.cur.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cur" {
  bucket = aws_s3_bucket.cur.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cur" {
  bucket = aws_s3_bucket.cur.id

  rule {
    id     = "limpieza"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "resultados-athena"
    status = "Enabled"
    filter {
      prefix = "athena/"
    }

    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "cur" {
  statement {
    sid       = "DataExports"
    actions   = ["s3:PutObject", "s3:GetBucketPolicy"]
    resources = [aws_s3_bucket.cur.arn, "${aws_s3_bucket.cur.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["billingreports.amazonaws.com", "bcm-data-exports.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values = [
        "arn:aws:cur:${local.region}:${local.cuenta}:definition/*",
        "arn:aws:bcm-data-exports:${local.region}:${local.cuenta}:export/*",
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.cuenta]
    }
  }

  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.cur.arn, "${aws_s3_bucket.cur.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "cur" {
  bucket = aws_s3_bucket.cur.id
  policy = data.aws_iam_policy_document.cur.json
}

resource "aws_bcmdataexports_export" "cur" {
  export {
    name        = "dimia-cur2"
    description = "CUR 2.0 horario con recursos y split cost allocation de EKS"

    data_query {
      # Columnas para §6.2 [confirmar contra la tabla COST_AND_USAGE_REPORT en el primer apply].
      query_statement = join(" ", [
        "SELECT",
        join(", ", [
          "bill_billing_period_start_date",
          "bill_payer_account_id",
          "line_item_usage_account_id",
          "line_item_line_item_type",
          "line_item_usage_start_date",
          "line_item_usage_end_date",
          "line_item_product_code",
          "line_item_usage_type",
          "line_item_operation",
          "line_item_resource_id",
          "line_item_usage_amount",
          "line_item_unblended_cost",
          "line_item_net_unblended_cost",
          "pricing_public_on_demand_cost",
          "product_region_code",
          "product_servicecode",
          "savings_plan_savings_plan_effective_cost",
          "reservation_effective_cost",
          "resource_tags",
          "cost_category",
          "split_line_item_parent_resource_id",
          "split_line_item_split_usage",
          "split_line_item_split_usage_ratio",
          "split_line_item_split_cost",
          "split_line_item_unused_cost",
        ]),
        "FROM COST_AND_USAGE_REPORT",
      ])

      table_configurations = {
        COST_AND_USAGE_REPORT = {
          TIME_GRANULARITY                      = "HOURLY"
          INCLUDE_RESOURCES                     = "TRUE"
          INCLUDE_SPLIT_COST_ALLOCATION_DATA    = "TRUE"
          INCLUDE_MANUAL_DISCOUNT_COMPATIBILITY = "FALSE"
        }
      }
    }

    destination_configurations {
      s3_destination {
        s3_bucket = aws_s3_bucket.cur.id
        s3_prefix = "cur2"
        s3_region = local.region

        s3_output_configurations {
          overwrite   = "OVERWRITE_REPORT"
          format      = "PARQUET"
          compression = "PARQUET"
          output_type = "CUSTOM"
        }
      }
    }

    refresh_cadence {
      frequency = "SYNCHRONOUS"
    }
  }

  depends_on = [aws_s3_bucket_policy.cur]
}

resource "aws_athena_workgroup" "finops" {
  name = "dimia-finops"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    bytes_scanned_cutoff_per_query     = 1073741824 # 1 GB (§6.2)

    result_configuration {
      output_location = "s3://${aws_s3_bucket.cur.id}/athena/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }
}
