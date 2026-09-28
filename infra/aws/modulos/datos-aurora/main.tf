# Aurora PostgreSQL por celda (§3.2): CMK propia, contraseña maestra en Secrets Manager rotada por RDS,
# autenticación IAM, replicación lógica prendida (se mide 30 días) y logs a CloudWatch.

data "aws_caller_identity" "actual" {}

data "aws_iam_policy_document" "llave" {
  #checkov:skip=CKV_AWS_109:Política de llave: el root de la cuenta administra la llave, patrón por omisión de KMS.
  #checkov:skip=CKV_AWS_111:Política de llave: el recurso es la propia llave.
  #checkov:skip=CKV_AWS_356:Política de llave: el recurso es la propia llave.
  statement {
    sid       = "Cuenta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.actual.account_id}:root"]
    }
  }
}

resource "aws_kms_key" "datos" {
  description             = "Datos de ${var.nombre}: Aurora, secretos y respaldos"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave.json
}

resource "aws_kms_alias" "datos" {
  name          = "alias/datos-${var.nombre}"
  target_key_id = aws_kms_key.datos.key_id
}

resource "aws_db_subnet_group" "this" {
  name       = var.nombre
  subnet_ids = var.subredes
}

resource "aws_security_group" "aurora" {
  name        = "aurora-${var.nombre}"
  description = "Aurora ${var.nombre}: solo el 5432 desde el clúster"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "clientes" {
  for_each                     = toset(var.sg_clientes)
  security_group_id            = aws_security_group.aurora.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL desde ${each.value}"
}

resource "aws_rds_cluster_parameter_group" "this" {
  name   = "${var.nombre}-pg17"
  family = "aurora-postgresql17"

  parameter {
    name         = "rds.logical_replication"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_rds_cluster" "this" {
  #checkov:skip=CKV2_AWS_8:AWS Backup al vault de la cuenta respaldo llega con el módulo de respaldo (§3.2).
  #checkov:skip=CKV_AWS_327:Va cifrado con la CMK de la celda (kms_key_id); checkov no la sigue por variable.
  cluster_identifier                  = var.nombre
  engine                              = "aurora-postgresql"
  engine_mode                         = "provisioned"
  engine_version                      = var.version_motor
  database_name                       = "dimia"
  master_username                     = "dimia_admin"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = aws_kms_key.datos.arn
  iam_database_authentication_enabled = true
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.datos.arn
  storage_type                        = "aurora"
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.aurora.id]
  db_cluster_parameter_group_name     = aws_rds_cluster_parameter_group.this.name
  backup_retention_period             = 7
  preferred_backup_window             = "08:00-09:00"
  preferred_maintenance_window        = "sun:09:30-sun:10:30"
  copy_tags_to_snapshot               = true
  deletion_protection                 = var.proteccion_borrado
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${var.nombre}-final"
  enabled_cloudwatch_logs_exports     = ["postgresql"]
  database_insights_mode              = "standard"

  serverlessv2_scaling_configuration {
    min_capacity             = var.acu.minimo
    max_capacity             = var.acu.maximo
    seconds_until_auto_pause = var.acu.minimo == 0 ? var.pausa_segundos : null
  }

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

resource "aws_rds_cluster_instance" "this" {
  #checkov:skip=CKV_AWS_118:Monitoreo mejorado cuesta por instancia; Database Insights estándar basta en esta etapa.
  count                           = 1 + var.lectores
  identifier                      = "${var.nombre}-${count.index}"
  cluster_identifier              = aws_rds_cluster.this.id
  instance_class                  = "db.serverless"
  engine                          = aws_rds_cluster.this.engine
  engine_version                  = aws_rds_cluster.this.engine_version
  db_subnet_group_name            = aws_db_subnet_group.this.name
  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.datos.arn
  promotion_tier                  = count.index
}
