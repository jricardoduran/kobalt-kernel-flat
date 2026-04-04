# V3 STORAGES — DIAGNÓSTICO EXACTO Y SOLUCIÓN

## El Problema

La cadena de storages en V3 tiene **5 eslabones**. El eslabón #0 está roto:
**no hay servicios registrados**.

```
CADENA COMPLETA:

#0  storages/GitLab/services/*.json   ← VACÍO (aquí se rompe todo)
     ↓
#1  api.php?action=active             ← retorna storages: [] (nada que listar)
     ↓
#2  auth.php → buildServicePackage    ← retorna services: [] (nada que cifrar)
     ↓
#3  openSession → _storeServiceKeys   ← no guarda nada en IDB (array vacío)
     ↓
#4  buildServices → loadRaw('svc:')   ← no encuentra nada → makeEmptyStorages()
     ↓
#5  syncSession → local_only          ← no hay conectores
```

## La Causa Raíz

El directorio `storages/GitLab/services/` está vacío. No se ha registrado
ningún servicio GitLab a través del sistema V3 (`storages/register.html`).

Si los servicios existían en el sistema V5 (en `GitLab/services/`), están
en una **ruta diferente** y con un **formato diferente** (sin `service_key`).

## La Solución

### Paso 1 — Crear el archivo de servicio

Crear `storages/GitLab/services/kobalt1.json` con esta estructura:

```json
{
    "id": "kobalt1",
    "label": "Mi GitLab",
    "type": "gitlab",
    "token": "glpat-TU_TOKEN_AQUI",
    "project_id": "TU_PROJECT_ID",
    "branch": "main",
    "base_path": "kobalt_data",
    "priority": 10,
    "enabled": true,
    "service_key": "GENERAR_CON_PASO_2",
    "url": "./storages/proxy.php",
    "created_at": "2026-04-04 00:00:00"
}
```

### Paso 2 — Generar service_key

Opción A: Via register.html (recomendado)
  → Abrir `storages/register.html` en el navegador
  → Registrar el servicio GitLab con las credenciales
  → api.php genera `service_key` automáticamente

Opción B: Via línea de comandos PHP
  ```
  php -r "echo bin2hex(random_bytes(32));"
  ```
  Copiar el resultado de 64 caracteres hex al campo `service_key`.

### Paso 3 — Verificar la cadena

Después de crear el servicio:

1. `api.php?action=active` debe retornar:
   ```json
   {"ok":true, "storages":[{"id":"kobalt1","type":"gitlab","url":"./storages/proxy.php",...}]}
   ```

2. `auth.php?action=login` debe retornar:
   ```json
   {"ok":true, "H_u":"...", "services":[{"id":"kobalt1","url":"./storages/proxy.php","key_enc":"..."}]}
   ```
   El campo `key_enc` es `service_key` cifrado con H_u (AES-GCM).

3. En la app, el kernel almacena `svc:kobalt1` en IDB con `key_enc` re-cifrado con D.

4. Cada operación de storage genera un token HMAC efímero:
   ```
   token = HMAC(service_key, "kobalt:storage" + "kobalt1" + window, 16)
   ```
   Y lo envía como header `X-Kobalt-Token`.

5. `proxy.php` verifica el token con la misma fórmula y delega a `gitlab.php`.

## Verificación con debug.php

Abrir `debug.php?k=KOBALT_DEBUG_2026` para verificar:
- PHP extensions (openssl, hash, curl)
- Funciones de cifrado
- Permisos de archivos
- Log de errores
