# Cimientos de AWS en OpenTofu

Código de §2.1, §3.1, §4 y §6.1 de [`planeacion/aws-arquitectura-meta.md`](../../planeacion/aws-arquitectura-meta.md).
**Nada de esto está aplicado.** No existe todavía la cuenta de AWS.

- OpenTofu 1.12.6 y `hashicorp/aws` 6.66.0, versiones fijas en cada pila y hashes en `.terraform.lock.hcl`.
- No se usan módulos del registro: todos los módulos son locales.
- El agente escribe y verifica este código, pero nunca lo aplica (§7).

## Qué hay

| Ruta | Qué es | Quién aplica |
|---|---|---|
| `bootstrap/` | Bucket del estado en `compartido` (us-east-2), réplica en mx, llave KMS multirregión, bloqueo nativo (`use_lockfile`) | Dueño, una vez |
| `modulos/organizacion` | Organización, OUs, cuentas base, root centralizado, SCP/RCP/declarativa, Identity Center | — |
| `modulos/cuenta-celda` | Alta de una cuenta de celda (vending), mx-central-1 habilitada, plan de direcciones | — |
| `modulos/cuenta-base` | OIDC de GitHub, roles `tofu-plan` y `tofu-apply` con límite de permisos, cifrado de EBS, bloqueo público de S3, Access Analyzer y budget | — |
| `modulos/red-celda` | VPC de doble pila con perfil `mx` (NAT regional o zonal) o `voz` (sin NAT), endpoints gateway, flow logs en Parquet y alarma de NAU | — |
| `modulos/finops` | Budgets de organización y de red diaria, freno de sandbox, Cost Anomaly Detection, CUR 2.0 y Athena con tope de 1 GB | — |
| `vivos/gestion`, `vivos/finops` | Cuenta de gestión | Dueño |
| `vivos/*/base` | Base de cada cuenta. `tofu-apply` no puede modificarse a sí mismo | Dueño |
| `vivos/noprod/red`, `vivos/celdas/c01/red-mx`, `vivos/voz/g1/red` | Redes | CI, con revisor |
| `politicas/` | SCP, RCP y política declarativa de EC2 en JSON | — |
| `pilas.json` | Pila → cuenta, quién la aplica y su environment de GitHub | — |

**Entornos.**
- Dev y staging comparten la cuenta `noprod`, con una VPC y NAT zonal. Se separan por namespace de Kubernetes (§2.1).
- Producción es una cuenta por celda.
- `vivos/voz/g1` es de la etapa B de voz. No se aplica hasta que la prueba P4 lo decida.

## Verificar (sin credenciales)

```
infra/aws/verificar.sh
```

El script corre `tofu fmt`, luego `validate` con `-backend=false` en cada módulo y pila, y después las pruebas de `modulos/*/pruebas`, `pilas.py --probar`, tflint con `tflint-ruleset-aws` 0.49.0 y checkov. Cada omisión de checkov lleva su motivo en una línea `#checkov:skip`.

## Pasos manuales del dueño, en orden

### 1. Cuenta de gestión (la «cuenta de administración general»)

1. Cree la cuenta en aws.amazon.com con el correo `aws+gestion@[ dominio ]` y una tarjeta de la empresa.
2. En el usuario root, active el **MFA de hardware con dos llaves**. Guarde una en el sobre sellado de emergencia (`[ decidir quién lo guarda ]`).
3. No cree llaves de acceso de root.
4. En *Account → Alternate contacts*, registre los contactos de facturación, operaciones y seguridad.
5. Active *IAM user and role access to Billing information*. Sin eso no funciona el permission set `facturacion`.
6. Deje el soporte en Basic. Business+ se contrata después, solo en las cuentas que tengan producción (§6.3).

### 2. Organización e Identity Center (consola, como root, una sola vez)

1. En *AWS Organizations*, cree la organización con **todas las funciones**.
2. Cree a mano la cuenta `compartido` con el correo `aws+compartido@[ dominio ]`. Luego habilítele mx-central-1 en *Account → Regions*.
3. Cambie la consola a **us-east-2** y habilite **IAM Identity Center** (instancia de organización).
4. Cree en Identity Center su usuario, con MFA obligatorio. Cree también un permission set llamado exactamente `emergencia` con `AdministratorAccess` y sesión de 1 h. Asígnelo a su usuario en la cuenta de gestión y en `compartido`.
5. Desde este punto trabaje con `aws configure sso` (perfil `dimia-emergencia`, sesión corta) y no vuelva a usar root.

### 3. Cuotas que se piden desde el primer día

- Service Quotas, en us-east-1 y desde gestión: **cuentas por organización, de 10 a 30**.
- Plantilla de cuotas de la organización (us-east-1/2, máximo 10 cuotas). Se asocia **antes** de crear las cuentas de voz.
- En cada cuenta de celda, a mano en mx-central-1, porque ahí no funcionan las plantillas: EC2 On-Demand Standard (L-1216C47A) de 5 a 128 vCPU, Spot (L-34B43A08) de 5 a 64 y concurrencia de Lambda a 1,000.
- En `noprod` y `sandbox-agente`: 32 vCPU.
- La lista completa está en §5 del documento.

### 4. Estado remoto (`bootstrap/`)

1. Asuma `OrganizationAccountAccessRole` en `compartido`.
2. Corra `tofu init` y luego `tofu apply -var org_id=o-xxxxxxxxxx`. El estado queda local.
3. Copie `estado.hcl.example` a `estado.hcl` y `comun.tfvars.example` a `comun.tfvars`, con las salidas del apply. Los dos archivos están en `.gitignore`.
4. Descomente el bloque `backend "s3"` de `bootstrap/versions.tf`.
5. Corra `tofu init -migrate-state -backend-config=../estado.hcl` y borre el `terraform.tfstate` local.
6. Cuando existan las cuentas (paso 5), vuelva a aplicar con `prefijos_por_cuenta`: cada ID de cuenta con roles `tofu-*` y el `estado.prefijo` de su base, por ejemplo `{ "<id de noprod>" = "noprod/", "<id de prod-celda-01>" = "celdas/c01/" }`. El bucket solo deja a los `tofu-*` de cada cuenta en su prefijo; una cuenta fuera del mapa no lee ni escribe estado.

### 5. Organización (`vivos/gestion`, perfil `dimia-emergencia` en gestión)

```
tofu init -backend-config=../../estado.hcl
tofu import -var-file=../../comun.tfvars module.organizacion.aws_organizations_organization.this <o-id>
tofu import -var-file=../../comun.tfvars 'module.organizacion.aws_organizations_account.base["compartido"]' <id de compartido>
tofu import -var-file=../../comun.tfvars 'module.organizacion.aws_ssoadmin_permission_set.this["emergencia"]' '<arn del permission set>,<arn de la instancia>'
tofu plan -var-file=../../comun.tfvars -out plan.out   # revisar
tofu apply plan.out
```

Este apply crea:
- las OUs, las cuentas base y la celda 01, con mx-central-1 habilitada;
- el root centralizado;
- las SCP. `regiones`, la RCP `perimetro` y la declarativa de EC2 quedan **solo en NoProd**;
- los permission sets y los grupos.

Después agréguese a los grupos `dimia-emergencia`, `dimia-guardia` y `dimia-facturacion`. El grupo `dimia-agente` es para la sesión del agente.

### 6. FinOps y bases de cuenta (dueño, con `emergencia` en cada cuenta)

Aplique en este orden:
1. `vivos/finops` (gestión)
2. `vivos/operaciones/base`
3. `vivos/sandbox-agente/base`
4. `vivos/noprod/base`
5. `vivos/celdas/c01/base`

En cada pila, igual que en el paso 5: `tofu init -backend-config=…/estado.hcl` y `tofu plan -var-file=…/comun.tfvars -out plan.out`. Revise el plan y corra `tofu apply plan.out`.

### 7. CI

1. Anote en `pilas.json` el ID de cada cuenta, y en `bootstrap` su prefijo (paso 4.6).
2. En GitHub, cree los environments `infra-noprod`, `infra-c01` e `infra-voz-g1`. Cada uno con **revisor obligatorio** (usted), solo la rama `main` y sin que el autor se pueda aprobar a sí mismo.
3. Cree las variables del repo `INFRA_ESTADO_HCL` e `INFRA_COMUN_TFVARS` con el contenido de los dos archivos locales. No son secretos.
4. Proteja `main` y `.github/workflows` con CODEOWNERS.
5. Al final, cree la variable `INFRA_AWS_HABILITADA=true`. Mientras no exista, los workflows solo verifican.

Lo que hace cada workflow:
- `infra-plan.yml`: en cada PR, verificación y `plan` con `tofu-plan` por OIDC, **solo en noprod**. En un PR corre el workflow de la rama del PR, así que solo las cuentas con `plan_en_pr = true` (en su base y en `pilas.json`) confían en ese claim. Corre checkov sobre el JSON del plan.
- `infra-apply.yml`: en `main`, `plan` de **todas** las pilas de CI; después, solo en las que cambian y tras la aprobación del environment, `apply` del **mismo** `plan.out`. El revisor ve el plan de producción en el resumen de ese run. El plan va cifrado del lado del cliente.

`tofu-plan` no lee contenido: un Deny explícito le quita objetos de S3 fuera de su estado, `kms:Decrypt` fuera de su llave, ítems de DynamoDB, eventos de logs, parámetros, secretos y mensajes. Aun así, en `main` cualquier workflow puede asumirlo. Pendiente: personalizar el claim `sub` del repo para incluir `job_workflow_ref` y fijarlo a `infra-plan.yml`/`infra-apply.yml` en la confianza (§3.9).

Las pilas manuales nunca se aplican desde CI.

### 8. Después

- Tras 1-2 semanas sin sorpresas en NoProd, ponga `guardarrailes_en_root = true` en `vivos/gestion`. Así las SCP de regiones, perímetro y EC2 pasan a Root.
- Cuando las etiquetas `dimia:*` ya aparezcan en la facturación (~24 h después del primer recurso etiquetado), ponga `activar_etiquetas = true` en `vivos/finops`.
- Si el freno de `sandbox-agente` se dispara, la SCP niega todo salvo ver, detener y borrar. Lo que ya corre sigue costando hasta que usted lo borre con `emergencia` (aws-nuke); los Auto Scaling groups y los node groups siguen lanzando con su rol de servicio hasta que los baje a cero.
- Revise en el primer apply los datos marcados `[confirmar]` en el código:
  - los grupos de uso del budget de red;
  - las columnas del CUR 2.0;
  - la dimensión de la alarma de NAU;
  - la exclusión de VPC Block Public Access, que va a nivel VPC en todos los perfiles;
  - que la RCP `oidc-github` no estorbe a otros emisores de identidad (EKS, Cognito);
  - que Budgets funcione en cada cuenta miembro (se crean con acceso de IAM a facturación).
