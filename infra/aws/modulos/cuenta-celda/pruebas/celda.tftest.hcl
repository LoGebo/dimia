mock_provider "aws" {
  mock_resource "aws_organizations_account" {
    defaults = { id = "222222222222" }
  }
}

variables {
  ou_id          = "ou-prod-11111111"
  dominio_correo = "dimia.mx"
}

run "celda_01" {
  command = plan

  variables {
    indice = 1
  }

  assert {
    condition     = output.cidr_mx == "10.20.0.0/16" && output.bloque == "10.20.0.0/14"
    error_message = "La celda k usa 10.(16+4k).0.0/14 y su mx es la primera /16."
  }

  assert {
    condition     = aws_organizations_account.this.email == "aws+celda01@dimia.mx" && output.nombre == "prod-celda-01"
    error_message = "Nombre y correo siguen la convención de §3.1."
  }
}

run "ultima_celda_no_toca_la_voz" {
  command = plan

  variables {
    indice = 45
  }

  assert {
    condition     = output.bloque == "10.196.0.0/14"
    error_message = "La celda 45 termina en 10.199: los grupos de voz empiezan en 10.200."
  }
}

run "celda_46_choca_con_la_voz" {
  command = plan

  variables {
    indice = 46
  }

  expect_failures = [var.indice]
}
