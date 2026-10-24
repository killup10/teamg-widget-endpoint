#!/usr/bin/env bash
# Run in OCI Cloud Shell (already authenticated), or an authenticated OCI CLI host.
# Creates infrastructure; no DNS, certificate issuance or Render credential migration.
set -Eeuo pipefail
umask 077
export OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True
REGION="${REGION:-sa-bogota-1}"
EXPECTED_TENANCY="${EXPECTED_TENANCY:-teamgcanada04}"
PROJECT="${PROJECT:-teamg-play}"
REPO_URL="${REPO_URL:-https://github.com/killup10/teamg-widget-endpoint.git}"
REPO_REF="${REPO_REF:-main}"
NODE_MAJOR="${NODE_MAJOR:-20}"
WAIT_FOR_APP="${WAIT_FOR_APP:-1}"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/teamg-oracle/$REGION}"
SSH_KEY="${SSH_KEY:-$STATE_DIR/id_ed25519}"
SHAPE='VM.Standard.E2.1.Micro'
for tool in oci jq python3 ssh-keygen flock; do
  command -v "$tool" >/dev/null || { echo "Falta: $tool" >&2; exit 1; }
done
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]{0,40}$ ]] || { echo 'PROJECT inválido'; exit 1; }
[[ "$NODE_MAJOR" =~ ^(20|22|24)$ ]] || { echo 'NODE_MAJOR debe ser 20, 22 o 24'; exit 1; }
mkdir -p "$STATE_DIR" "$(dirname "$SSH_KEY")"
chmod 700 "$STATE_DIR"
exec 9>"$STATE_DIR/run.lock"
flock -n 9 || { echo 'Ya hay una ejecución activa.' >&2; exit 1; }
STATE_FILE="$STATE_DIR/resources.json"
[[ -f "$STATE_FILE" ]] || printf '{}\n' > "$STATE_FILE"
jq -e 'type == "object"' "$STATE_FILE" >/dev/null
trap 'echo "ERROR en línea $LINENO. Estado conservado en $STATE_FILE; no se borraron recursos. Reejecuta para continuar." >&2' ERR
oci_cmd() { oci --region "$REGION" "$@"; }
save() {
  jq --arg key "$1" --arg value "$2" '.[$key]=$value' "$STATE_FILE" > "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}
get() { jq -r --arg key "$1" '.[$key] // empty' "$STATE_FILE"; }
wait_state() {
  local desired="$1" timeout="$2" observed deadline
  shift 2
  deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    observed="$(oci_cmd "$@" --query 'data."lifecycle-state"' --raw-output)"
    [[ "$observed" == "$desired" ]] && return 0
    case "$observed" in TERMINATING|TERMINATED|FAULTY|FAILED)
      echo "Estado inesperado: $observed" >&2; return 1;; esac
    sleep 5
  done
  echo "Tiempo agotado esperando $desired" >&2; return 1
}
ensure() {
  local key="$1" id
  shift
  id="$(get "$key")"
  if [[ -z "$id" ]]; then
    id="$(oci_cmd "$@" --query data.id --raw-output)"
    [[ "$id" == ocid1.* ]] || { echo "Respuesta inesperada creando $key" >&2; return 1; }
    save "$key" "$id"
  fi
  printf '%s\n' "$id"
}

# Cloud Shell exports OCI_TENANCY. On another host read only the tenancy field.
TENANCY_OCID="${TENANCY_OCID:-${OCI_TENANCY:-}}"
if [[ -z "$TENANCY_OCID" ]]; then
  TENANCY_OCID="$(python3 - <<'PY'
import configparser, os
p = configparser.ConfigParser(interpolation=None)
p.read(os.environ.get('OCI_CLI_CONFIG_FILE', os.path.expanduser('~/.oci/config')))
print(p.get(os.environ.get('OCI_CLI_PROFILE', 'DEFAULT'), 'tenancy', fallback=''))
PY
  )"
fi
[[ "$TENANCY_OCID" == ocid1.tenancy.* ]] || { echo 'No se detectó TENANCY_OCID. Usa OCI Cloud Shell o configura OCI CLI.' >&2; exit 1; }
TENANCY_JSON="$(oci_cmd iam tenancy get --tenancy-id "$TENANCY_OCID")"
[[ "$(jq -r '.data.name' <<< "$TENANCY_JSON")" == "$EXPECTED_TENANCY" ]] || { echo 'La cuenta autenticada no corresponde a la tenancy esperada.' >&2; exit 1; }
HOME_REGION_KEY="$(jq -r '.data."home-region-key"' <<< "$TENANCY_JSON")"
HOME_REGION="$(oci_cmd iam region list | jq -r --arg key "$HOME_REGION_KEY" '.data[] | select(.key==$key) | .name')"
[[ "$REGION" == "$HOME_REGION" ]] || { echo "Always Free debe crearse en tu región principal: $HOME_REGION; se detiene sin crear recursos." >&2; exit 1; }
COMPARTMENT_ID="${COMPARTMENT_ID:-$TENANCY_OCID}"
if [[ -n "$(get tenancy)" && "$(get tenancy)" != "$TENANCY_OCID" ]] ||
   [[ -n "$(get compartment)" && "$(get compartment)" != "$COMPARTMENT_ID" ]] ||
   [[ -n "$(get project)" && "$(get project)" != "$PROJECT" ]]; then
  echo 'El directorio de estado pertenece a otro despliegue; utiliza otro STATE_DIR.' >&2; exit 1
fi
save tenancy "$TENANCY_OCID"; save compartment "$COMPARTMENT_ID"; save project "$PROJECT"

# Stop before networking if this shape/image is unavailable. Never substitute a paid shape.
AD_LIST="$(oci_cmd iam availability-domain list --compartment-id "$TENANCY_OCID")"
AD="${AVAILABILITY_DOMAIN:-}"
if [[ -z "$AD" ]]; then
  while IFS= read -r candidate; do
    SHAPES="$(oci_cmd compute shape list --compartment-id "$COMPARTMENT_ID" --availability-domain "$candidate" --all)"
    if jq -e --arg shape "$SHAPE" '.data | any(.shape==$shape)' <<< "$SHAPES" >/dev/null; then AD="$candidate"; break; fi
  done < <(jq -r '.data[].name' <<< "$AD_LIST")
fi
[[ -n "$AD" ]] || { echo 'E2.1.Micro no está ofrecida en esta región/dominio. No se creó una VM de pago.' >&2; exit 1; }
IMAGE_ID="$(oci_cmd compute image list --compartment-id "$COMPARTMENT_ID" --operating-system 'Canonical Ubuntu' \
  --operating-system-version '22.04' --shape "$SHAPE" --all |
  jq -r '[.data[] | select(."lifecycle-state"=="AVAILABLE")]|sort_by(."time-created")|last|.id // empty')"
[[ "$IMAGE_ID" == ocid1.image.* ]] || { echo 'No hay imagen oficial Ubuntu 22.04 compatible; se detiene.' >&2; exit 1; }
if [[ ! -f "$SSH_KEY" ]]; then ssh-keygen -q -t ed25519 -N '' -C "$PROJECT-oracle" -f "$SSH_KEY"; fi
[[ -f "$SSH_KEY.pub" ]] || ssh-keygen -y -P '' -f "$SSH_KEY" > "$SSH_KEY.pub"
chmod 600 "$SSH_KEY"; chmod 644 "$SSH_KEY.pub"

echo "Cuenta validada. Región: $REGION. Shape: $SHAPE. Node: $NODE_MAJOR."
[[ "$NODE_MAJOR" != 20 ]] || echo 'AVISO: Node 20 está fuera de soporte; NODE_MAJOR=22 usa una rama mantenida.'

# Secrets are generated inside the VM, never put into OCI user-data.
{
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\numask 077\n'
  printf 'REPO_URL=%q\nREPO_REF=%q\nNODE_MAJOR=%q\n' "$REPO_URL" "$REPO_REF" "$NODE_MAJOR"
  cat <<'CLOUD_INIT'
exec > >(tee -a /var/log/teamg-provision.log) 2>&1
trap 'echo "PROVISIONAMIENTO FALLÓ en línea $LINENO" >&2' ERR
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
APP=/var/www/teamg-play

if ! swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
  if [[ ! -e /swapfile ]]; then fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; fi
  swapon /swapfile
fi
grep -qE '^/swapfile[[:space:]]' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-teamg-swap.conf
sysctl -p /etc/sysctl.d/99-teamg-swap.conf
apt-get -o Acquire::Retries=3 update
apt-get -o Acquire::Retries=3 upgrade -y
apt-get -o Acquire::Retries=3 install -y ca-certificates curl gnupg git ffmpeg build-essential nginx \
  python3 openssl iptables-persistent netfilter-persistent
curl --fail --silent --show-error --location --retry 3 "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/teamg-nodesource.sh
bash /tmp/teamg-nodesource.sh
apt-get -o Acquire::Retries=3 install -y nodejs
npm install --global pm2

# Insert before Oracle's reject rules; keep existing SSH and OCI service rules.
for port in 22 80 443 3000; do
  iptables -C INPUT -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 1 -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT
done
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  for port in 22 80 443 3000; do ufw allow "$port/tcp"; done
fi
netfilter-persistent save

install -d -o ubuntu -g ubuntu /var/www
if [[ ! -d "$APP/.git" ]]; then
  sudo -u ubuntu -H git clone --branch "$REPO_REF" --single-branch "$REPO_URL" "$APP"
fi
# Existing app.env is retained on a deliberate manual bootstrap retry.
if [[ ! -f /etc/teamg-play.env ]]; then
  {
    printf 'PORT=3000\nNODE_ENV=production\nFFMPEG_PATH=/usr/bin/ffmpeg\nANDROID_AUDIO_MAX_SESSIONS=1\n'
    printf 'ADMIN_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'MONGODB_URI=\nDEEZER_ARL=\n'
  } > /etc/teamg-play.env
  chown root:ubuntu /etc/teamg-play.env
  chmod 640 /etc/teamg-play.env
fi
sudo -u ubuntu -H bash -c '
  set -Eeuo pipefail
  umask 077
  set -a; . /etc/teamg-play.env; set +a
  cd /var/www/teamg-play
  export NODE_OPTIONS=--max-old-space-size=384
  if [[ -f package-lock.json ]]; then npm ci --omit=dev; else npm install --omit=dev; fi
  if pm2 describe teamg-play >/dev/null 2>&1; then pm2 restart teamg-play --update-env
  else pm2 start server.js --name teamg-play --time --max-memory-restart 400M; fi
  pm2 save
'
env PATH="$PATH" pm2 startup systemd -u ubuntu --hp /home/ubuntu
systemctl enable pm2-ubuntu

cat > /etc/nginx/conf.d/teamg-websocket.conf <<'NGINX_MAP'
map $http_upgrade $teamg_connection {
    default upgrade;
    '' '';
}
NGINX_MAP
cat > /etc/nginx/sites-available/teamg <<'NGINX_SITE'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ott.teamg.store widget.teamg.store _;
    client_max_body_size 15m;
    # Plain HTTP intentionally retained for legacy NetCast. No HTTPS redirect.
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $teamg_connection;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        # CORS and 206 originate in Node; do not duplicate CORS headers here.
    }
}
NGINX_SITE
ln -sfn /etc/nginx/sites-available/teamg /etc/nginx/sites-enabled/teamg
# Ubuntu's package-provided default site conflicts with default_server.
if [[ -L /etc/nginx/sites-enabled/default ]]; then unlink /etc/nginx/sites-enabled/default; fi
nginx -t
systemctl enable nginx
systemctl restart nginx
for attempt in $(seq 1 30); do
  if [[ "$(curl -fsS --max-time 5 http://127.0.0.1/ping || true)" == pong ]]; then
    touch /var/lib/teamg-provision-ready
    echo 'TEAMG_PROVISION_READY: Nginx y Node responden por HTTP.'
    echo 'Pendiente: trasladar credenciales MongoDB/Deezer, configurar DNS y certificado HTTPS.'
    exit 0
  fi
  sleep 2
done
echo 'Node no respondió en /ping. Revisar PM2 y /var/log/teamg-provision.log.' >&2
exit 1
CLOUD_INIT
} > "$STATE_DIR/cloud-init.sh"

VCN_ID="$(ensure vcn network vcn create --compartment-id "$COMPARTMENT_ID" --display-name "$PROJECT-vcn" --cidr-block 10.0.0.0/16 --dns-label teamgvcn)"
IGW_ID="$(ensure igw network internet-gateway create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$PROJECT-igw" --is-enabled true)"
jq -n --arg id "$IGW_ID" '[{destination:"0.0.0.0/0",destinationType:"CIDR_BLOCK",networkEntityId:$id}]' > "$STATE_DIR/routes.json"
RT_ID="$(ensure route_table network route-table create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$PROJECT-routes" --route-rules "file://$STATE_DIR/routes.json")"
jq -n '[22,80,443,3000] | map({protocol:"6",source:"0.0.0.0/0",sourceType:"CIDR_BLOCK",isStateless:false,tcpOptions:{destinationPortRange:{min:.,max:.}}}) + [{protocol:"1",source:"0.0.0.0/0",sourceType:"CIDR_BLOCK",isStateless:false,icmpOptions:{type:3,code:4}}]' > "$STATE_DIR/ingress.json"
printf '[{"protocol":"all","destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","isStateless":false}]\n' > "$STATE_DIR/egress.json"
SL_ID="$(ensure security_list network security-list create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$PROJECT-security" --ingress-security-rules "file://$STATE_DIR/ingress.json" --egress-security-rules "file://$STATE_DIR/egress.json")"
SUBNET_ID="$(ensure subnet network subnet create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$PROJECT-public" --cidr-block 10.0.0.0/24 --dns-label public --route-table-id "$RT_ID" --security-list-ids "[\"$SL_ID\"]" --prohibit-public-ip-on-vnic false)"
# Async network creates are saved first, then awaited so retry doesn't create duplicates.
wait_state AVAILABLE 300 network subnet get --subnet-id "$SUBNET_ID"
INSTANCE_ID="$(get instance)"
if [[ -z "$INSTANCE_ID" ]]; then
  # OCI may reject this for quota/capacity. Do not retry into a larger paid shape.
  INSTANCE_ID="$(oci_cmd compute instance launch --compartment-id "$COMPARTMENT_ID" --availability-domain "$AD" \
    --display-name "$PROJECT" --shape "$SHAPE" --image-id "$IMAGE_ID" --subnet-id "$SUBNET_ID" \
    --assign-public-ip true --boot-volume-size-in-gbs 50 --ssh-authorized-keys-file "$SSH_KEY.pub" \
    --user-data-file "$STATE_DIR/cloud-init.sh" --query data.id --raw-output)"
  save instance "$INSTANCE_ID"
fi
echo "Esperando RUNNING: $INSTANCE_ID"
wait_state RUNNING 900 compute instance get --instance-id "$INSTANCE_ID"
PUBLIC_IP=''
for attempt in $(seq 1 30); do
  PUBLIC_IP="$(oci_cmd compute instance list-vnics --instance-id "$INSTANCE_ID" --all |
    jq -r '[.data[] | select(."is-primary"==true)][0]."public-ip" // empty')"
  [[ -n "$PUBLIC_IP" ]] && break
  sleep 2
done
[[ -n "$PUBLIC_IP" ]] || { echo 'No se encontró una IP pública.' >&2; exit 1; }
save public_ip "$PUBLIC_IP"
printf '\nIP pública: %s\nClave privada (conservar): %s\nEstado: %s\n' "$PUBLIC_IP" "$SSH_KEY" "$STATE_FILE"
printf 'SSH: ssh -i %q ubuntu@%s\nHTTP: http://%s/ott/index.html\n' "$SSH_KEY" "$PUBLIC_IP" "$PUBLIC_IP"
echo 'IP efímera; no cambiar DNS hasta reservar IP y validar la migración.'
echo 'Puerto 3000 público por petición expresa: permite acceder a Node sin pasar por Nginx.'
if [[ "$WAIT_FOR_APP" != 1 ]]; then
  echo 'Cloud-init sigue trabajando. RUNNING no significa instalación terminada.'
  exit 0
fi
command -v curl >/dev/null || { echo 'Falta curl para verificar HTTP.' >&2; exit 1; }
echo 'Esperando instalación y HTTP (máximo 20 minutos). Cloud Shell necesita acceso a red pública.'
for attempt in $(seq 1 120); do
  if [[ "$(curl -fsS --max-time 5 "http://$PUBLIC_IP/ping" 2>/dev/null || true)" == pong ]]; then
    echo "VERIFICADO: http://$PUBLIC_IP/ping devuelve pong por puerto 80."
    echo 'Listo el despliegue HTTP; DNS, HTTPS y credenciales de Render siguen pendientes.'
    exit 0
  fi
  sleep 5
done
echo 'No se pudo confirmar HTTP. La VM puede seguir instalando o Cloud Shell no tener red pública.' >&2
printf 'Diagnóstico: ssh -i %q ubuntu@%s "sudo cloud-init status --long; sudo tail -n 60 /var/log/teamg-provision.log"\n' "$SSH_KEY" "$PUBLIC_IP" >&2
exit 1
