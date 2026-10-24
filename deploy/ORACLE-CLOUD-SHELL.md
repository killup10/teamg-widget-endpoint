# Crear TeamG Play desde OCI Cloud Shell

El archivo `oracle-bootstrap.sh` crea una VCN independiente, gateway de Internet, rutas, Security List, subred pública, clave SSH y VM AMD E2.1.Micro con Ubuntu 22.04. Cloud-init configura swap, firewall, Node, FFmpeg, PM2 y Nginx HTTP sin redirección HTTPS. No necesita obtener OCIDs manualmente en Cloud Shell.

## Ejecutar

1. Abre Developer tools (`>_`) → Cloud Shell en la consola de Oracle. La CLI ya está autenticada.
2. Para transferir sin usar formularios de infraestructura: escribe `cat > oracle-bootstrap.sh`, pega el contenido completo del archivo y pulsa Ctrl+D en una línea nueva. Alternativamente, arrastra este único archivo al terminal de Cloud Shell.
3. Ejecuta:

```bash
chmod 700 oracle-bootstrap.sh
NODE_MAJOR=22 bash ./oracle-bootstrap.sh
```

Node 20 es el valor predeterminado solicitado, pero ya está fuera de soporte. La variable del comando anterior elige Node 22. Para usar exactamente Node 20:

```bash
NODE_MAJOR=20 bash ./oracle-bootstrap.sh
```

La instalación tarda varios minutos, no un minuto. La provisión depende de la capacidad/quota de Oracle y del acceso a los repositorios de paquetes. La forma E2.1.Micro aporta 1 GB RAM, 1/8 OCPU base y hasta 50 Mbps públicos: el swap no sustituye CPU ni permite prometer múltiples transcodificaciones.

Cloud Shell debe tener red pública para validar el HTTP y para usar SSH hacia la IP pública. En modo OCI Service Network, la infraestructura puede crearse igualmente; usa `WAIT_FOR_APP=0 NODE_MAJOR=22 bash ./oracle-bootstrap.sh` y verifica luego desde tu PC. Si la organización no autoriza la red pública de Cloud Shell, ejecutar la OCI CLI autenticada desde otro equipo evita depender de esa conexión. El script no cambia políticas IAM ni pide permisos adicionales automáticamente.

## Lo que entrega

- Región fija por defecto `sa-bogota-1`, validada contra la región principal de tu cuenta para Always Free.
- Cuenta esperada `teamgcanada04`; se detiene si estás autenticado en otra.
- Repositorio real `https://github.com/killup10/teamg-widget-endpoint.git`, rama `main`.
- Infraestructura con 10.0.0.0/16 y subred 10.0.0.0/24.
- Entrada TCP 22/80/443/3000 desde 0.0.0.0/0, como solicitaste. El 3000 permite saltarse Nginx.
- Acceso SSH como `ubuntu` con sudo. No habilita login remoto de root.
- IP pública automática **efímera**, no reservada.
- Node en puerto 3000, Nginx en 80, `proxy_buffering off`, encabezados proxy, WebSockets y paso de Range. El 206 depende de la respuesta real del origen/aplicación; Nginx no puede corregir un proveedor que ignore Range.
- `FFMPEG_PATH=/usr/bin/ffmpeg` y una sola sesión de empaquetado de audio como límite inicial.
- Secretos nuevos generados dentro de la VM y guardados en `/etc/teamg-play.env`, propietario root y grupo ubuntu, modo 640. No se incluyen secretos en el user-data de Oracle.
- PM2 como ubuntu, con persistencia systemd y reinicio por memoria de 400 MB.
- Estado y clave privada en `~/.local/state/teamg-oracle/sa-bogota-1/`. Conserva ese directorio para reanudar y acceder. No lo publiques ni lo pegues en el chat.

Al terminar, imprime IP, ruta de clave y comando SSH. Solo anuncia HTTP verificado si `/ping` responde `pong` en el puerto 80 desde el equipo que ejecuta el script. `RUNNING` por sí solo no implica que cloud-init haya terminado.

## Importante para la migración real

El script instala el estado remoto del repositorio: no lleva los cambios locales aún sin publicar de este chat. No copia variables de Render ni modifica DNS. El puerto 443 queda permitido en red, pero **todavía no hay HTTPS**: hace falta el certificado y un bloque Nginx 443 después de validar dominios.

`MONGODB_URI` y `DEEZER_ARL` quedan vacíos. Sin MongoDB, el repositorio trabaja en memoria y no es una migración persistente de clientes. Configura antes de atender usuarios las variables reales, en la VM, con:

```bash
sudoedit /etc/teamg-play.env
sudo -u ubuntu -H bash -c 'set -a; . /etc/teamg-play.env; set +a; pm2 restart teamg-play --update-env; pm2 save'
```

El archivo usa sintaxis Bash; valores que contengan caracteres especiales deben ir entre comillas simples. Usa una clave ADMIN/TOKEN existente si necesitas conservar compatibilidad con sesiones anteriores; el script genera claves nuevas al ser una instalación desde cero. No pegues cadenas MongoDB ni ARL en el chat. En el repositorio actual, un DEEZER_ARL vacío activa el fallback incrustado auditado; hay que retirar ese fallback y configurar una credencial propia antes de producción.

Los proxies y el diagnóstico públicos detectados en la auditoría siguen siendo problemas del código remoto. Instalar Nginx no los autentica, y exponer 3000 también da acceso directo. Este archivo automatiza infraestructura, no declara solucionados esos hallazgos.

## Diagnóstico

Entra usando el comando SSH que imprime el script y ejecuta:

```bash
sudo cloud-init status --long
sudo tail -n 100 /var/log/teamg-provision.log
sudo -u ubuntu -H pm2 status
sudo nginx -t
curl -i http://127.0.0.1/ping
```

Reintentar `bash oracle-bootstrap.sh` reutiliza los OCIDs guardados. No elimina recursos al fallar y no selecciona shapes pagadas como respaldo. Si la respuesta de una creación se pierde antes de guardar su OCID, revisa la consola/CLI antes de repetir para evitar recursos duplicados. No ejecutes en paralelo ni borres el estado para reintentar.

Si cloud-init falla, revisa el log; volver a ejecutar el script principal reutiliza la VM y no repite automáticamente cloud-init. Tras corregir la causa puedes reejecutar el script de usuario en esa VM con `sudo bash /var/lib/cloud/instance/scripts/part-001`; no hace falta crear otra instancia. El bootstrap no fuerza reinicios del sistema tras apt upgrade; revisa `/var/run/reboot-required` al terminar.

Una cuenta en Free Trial puede consumir créditos si usas recursos fuera de sus límites Always Free. El script fija la forma gratuita y un volumen de 50 GB, pero no sustituye la revisión de la cuota acumulada de la cuenta.

## Validación realizada

Se comprobó sintaxis con Bash y las opciones OCI contra la documentación oficial. No se ejecutó una creación real de recursos ni se probó cloud-init en una VM durante la preparación. Hay pruebas automatizadas de orquestación con OCI simulado; no certifican disponibilidad o cuotas reales.

Fuentes: [Cloud Shell](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/devcloudshellgettingstarted.htm), [launch de instancia](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/compute/instance/launch.html), [imágenes Ubuntu](https://ubuntu.com/docs/oracle/oracle-how-to/find-ubuntu-images/), [Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [ciclo de Node](https://nodejs.org/en/about/previous-releases).
