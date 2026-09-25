#!/usr/bin/env bash
# Verificación sin credenciales de AWS: formato, validate por módulo y pila (-backend=false),
# pruebas de OpenTofu, tflint con el ruleset de AWS y checkov. La corre CI en cada PR.
set -euo pipefail
cd "$(dirname "$0")"

tofu fmt -recursive -check -diff .

for d in bootstrap modulos/* $(find vivos -name versions.tf -exec dirname {} \; | sort); do
  echo "== $d"
  (cd "$d" && tofu init -backend=false -input=false >/dev/null && tofu validate -no-color)
  if [ -d "$d/pruebas" ]; then
    (cd "$d" && tofu test -test-directory=pruebas -no-color)
  fi
done

python3 pilas.py --probar

tflint --init --config "$PWD/.tflint.hcl" >/dev/null
tflint --recursive --config "$PWD/.tflint.hcl"

checkov -d . --framework terraform --compact --quiet
