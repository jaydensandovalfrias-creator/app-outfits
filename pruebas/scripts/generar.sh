#!/usr/bin/env bash
# Una petición a flux-2-klein-4b en Cloudflare Workers AI.
#
# El token NO va aquí: en el entorno de pruebas el proxy agrega el
# encabezado Authorization a api.cloudflare.com. Fuera de ese entorno,
# exporta CLOUDFLARE_API_TOKEN y se manda como Bearer.
#
# Uso:
#   ./generar.sh salida.jpg "prompt" [ancho] [alto] [ref0.jpg ref1.jpg ref2.jpg ref3.jpg]
# Ejemplo (prueba 3):
#   ./generar.sh resultado.jpg "Dress the person..." 768 1024 persona-511.jpg sudadera-511.jpg cabeza-511.jpg
#
# Cada referencia debe ser menor a 512x512. Respuesta: JPEG en base64 en result.image.
set -euo pipefail

salida="$1"; prompt="$2"; ancho="${3:-1024}"; alto="${4:-1024}"
shift $(( $# < 4 ? $# : 4 ))
: "${CLOUDFLARE_ACCOUNT_ID:?falta CLOUDFLARE_ACCOUNT_ID}"

args=(--form "prompt=${prompt}" --form "width=${ancho}" --form "height=${alto}")
i=0
for ref in "$@"; do
  (( i < 4 )) || { echo "máximo 4 referencias" >&2; exit 1; }
  args+=(--form "input_image_${i}=@${ref};type=image/jpeg")
  i=$((i + 1))
done
auth=()
[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && auth=(--header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

tmp="$(mktemp)"; encabezados="$(mktemp)"
trap 'rm -f "$tmp" "$encabezados"' EXIT

curl -sS --request POST \
  --url "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b" \
  "${auth[@]}" "${args[@]}" -D "$encabezados" -o "$tmp" \
  -w "http=%{http_code} tiempo=%{time_total}s\n"
grep -i "cf-ai-neurons" "$encabezados" || true

python3 -I - "$tmp" "$salida" <<'EOF'
import base64, json, sys
datos = json.load(open(sys.argv[1]))
if not datos.get("success"):
    sys.exit(f"error: {datos.get('errors')}")
open(sys.argv[2], "wb").write(base64.b64decode(datos["result"]["image"]))
print("guardado en", sys.argv[2])
EOF
