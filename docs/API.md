# Contrato HTTP y ejemplos

Base local: `http://127.0.0.1:3000/api`. Fechas ISO 8601 UTC. Todas las respuestas de la API deshabilitan caché. Las peticiones de escritura con cuerpo usan `Content-Type: application/json` (máximo 16 KB). Se requiere cookie de sesión y `X-CSRF-Token` para las escrituras, incluido registro e inicio de sesión. Se obtiene un token con `GET /session` y se reemplaza al autenticar.

## Recursos

| Método y ruta | Acceso | Respuesta correcta |
|---|---|---|
| `GET /health` | Público | 200 `{data:{status:"ok"}}` |
| `GET /session` | Público | 200 usuario o null y token CSRF |
| `POST /auth/register` | Cookie anónima + CSRF | 201 usuario y nuevo token |
| `POST /auth/login` | Cookie + CSRF | 200 usuario y nuevo token |
| `POST /auth/logout` | Autenticado + CSRF | 204 sin cuerpo; revoca sesión y cierra SSE |
| `GET /tasks` | Autenticado | 200 lista y metadatos |
| `POST /tasks` | Autenticado + CSRF | 201 tarea, `Location`, `ETag` |
| `GET /tasks/:id` | Autenticado | 200 tarea y `ETag` |
| `PUT /tasks/:id` | Autenticado + CSRF + If-Match | 200 reemplazo completo y nueva versión |
| `PATCH /tasks/:id` | Autenticado + CSRF + If-Match | 200 modificación parcial y nueva versión |
| `DELETE /tasks/:id` | Autenticado + CSRF + If-Match | 204 sin cuerpo |
| `GET /tasks/export` | Autenticado | 200 archivo adjunto `tareas.json` |
| `GET /events` | Autenticado | 200 flujo `text/event-stream` |

Los recursos pertenecen al usuario autenticado. Un ID ajeno devuelve 404. Los métodos no admitidos sobre `/tasks` y `/tasks/:id` devuelven 405 con `Allow`. `HEAD` es soportado automáticamente para GET. No se habilita CORS: la interfaz y la API comparten origen.

## Validación

| Campo | Regla |
|---|---|
| `username` | 3-30 caracteres `[a-z0-9_]`; trim y minúsculas |
| `password` | 10-128 caracteres, sin recortar espacios |
| `title` | Texto de 3-120 caracteres después de trim; único por usuario tras normalización NFKC y minúsculas |
| `description` | Texto hasta 2000 caracteres; trim; por defecto vacío en POST |
| `status` | `pendiente`, `en_progreso`, `completada`; por defecto `pendiente` en POST |
| `priority` | `baja`, `media`, `alta`; por defecto `media` en POST |
| `id` | Entero positivo seguro, sin ceros iniciales |

`PUT` exige los cuatro campos editables. `PATCH` exige al menos uno. No se permite escribir `id`, `owner_id`, fechas ni `version`; se rechazan campos adicionales. `GET /tasks` admite `status`, `priority`, `q` (hasta 120 caracteres), `limit` (1-99, defecto 50) y `offset` (0-999999, defecto 0); no acepta parámetros desconocidos. El orden es ID descendente y `q` busca literalmente en el título, sin comodines SQL.

## Ejemplos de petición y respuesta

Los comandos usan `curl` de Bash; en PowerShell usar `curl.exe` o importar la colección Postman. El archivo temporal `cookies.txt` mantiene la sesión y debe guardarse fuera del repositorio. Los valores de `TOKEN` e ID se extraen de las respuestas reales.

### 1. Obtener sesión anónima

```sh
curl -i -c cookies.txt http://127.0.0.1:3000/api/session
```

```json
{"data":{"user":null,"csrfToken":"TOKEN_ANONIMO"}}
```

### 2. Registrar o iniciar sesión

```sh
curl -i -b cookies.txt -c cookies.txt \
  -H 'Content-Type: application/json' -H 'X-CSRF-Token: TOKEN_ANONIMO' \
  -d '{"username":"estudiante","password":"PruebaSegura123!"}' \
  http://127.0.0.1:3000/api/auth/register
```

HTTP **201**; registro con inicio de sesión y cookie regenerada. Para acceder a una cuenta existente, usar la misma petición con `/auth/login` (HTTP **200**).

```json
{"data":{"user":{"id":1,"username":"estudiante"},"csrfToken":"TOKEN_AUTENTICADO"}}
```

### 3. Crear y leer

```sh
curl -i -b cookies.txt -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: TOKEN_AUTENTICADO' \
  -d '{"title":"Entregar API","priority":"alta"}' \
  http://127.0.0.1:3000/api/tasks
```

HTTP **201**, `Location: /api/tasks/1`, `ETag: "1"`. Fechas e ID son ilustrativos:

```json
{"data":{"id":1,"title":"Entregar API","description":"","status":"pendiente","priority":"alta","version":1,"createdAt":"2026-10-31T20:00:00.000Z","updatedAt":"2026-10-31T20:00:00.000Z"}}
```

```sh
curl -i -b cookies.txt http://127.0.0.1:3000/api/tasks/1
curl -i -b cookies.txt 'http://127.0.0.1:3000/api/tasks?status=pendiente&priority=alta&limit=10&offset=0'
```

El listado responde HTTP **200** con `{"data":[...],"meta":{"total":1,"limit":10,"offset":0}}`; la lectura individual responde con `{data:{...}}` y el ETag actual.

### 4. Reemplazar y modificar

```sh
curl -i -X PUT -b cookies.txt -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: TOKEN_AUTENTICADO' -H 'If-Match: "1"' \
  -d '{"title":"Entregar API","description":"Informe y código listos","status":"en_progreso","priority":"alta"}' \
  http://127.0.0.1:3000/api/tasks/1

curl -i -X PATCH -b cookies.txt -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: TOKEN_AUTENTICADO' -H 'If-Match: "2"' \
  -d '{"status":"completada"}' http://127.0.0.1:3000/api/tasks/1
```

Ambos devuelven HTTP **200**, la tarea y un nuevo ETag. El PUT incrementa a versión 2 y el PATCH a versión 3. Usar una versión anterior produce HTTP **412**; el cliente debe leer otra vez antes de reintentar.

### 5. Exportar, eliminar y salir

```sh
curl -b cookies.txt -o tareas.json http://127.0.0.1:3000/api/tasks/export
curl -i -X DELETE -b cookies.txt -H 'X-CSRF-Token: TOKEN_AUTENTICADO' \
  -H 'If-Match: "3"' http://127.0.0.1:3000/api/tasks/1
curl -i -X POST -b cookies.txt -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: TOKEN_AUTENTICADO' -d '{}' \
  http://127.0.0.1:3000/api/auth/logout
```

Exportar devuelve HTTP **200**, `Content-Disposition: attachment; filename=tareas.json` y `{data:[...]}`. DELETE y logout devuelven **204**, sin cuerpo.

### 6. Observar cambios en tiempo real

En otra terminal, antes de crear o modificar tareas:

```sh
curl -N -b cookies.txt http://127.0.0.1:3000/api/events
```

```text
retry: 3000
event: connected
data: {"connected":true}

event: task.changed
data: {"type":"created","task":{"id":1,"title":"Entregar API","description":"","status":"pendiente","priority":"alta","version":1,"createdAt":"2026-10-31T20:00:00.000Z","updatedAt":"2026-10-31T20:00:00.000Z"},"occurredAt":"2026-10-31T20:00:00.001Z"}
```

Tipos: `created`, `updated`, `deleted`; al eliminar, `task` contiene solo `id`. El heartbeat es un comentario SSE cada 15 segundos. Se verifica la sesión al publicar y en cada heartbeat. La sesión se revoca al salir; una conexión inactiva vencida se cierra en el siguiente heartbeat. SSE no necesita CSRF porque solo lee. En el navegador, `EventSource('/api/events')` envía la cookie del mismo origen. Los eventos son efímeros: al reconectar, el cliente vuelve a consultar el listado completo.

## Errores uniformes

```json
{"error":{"code":"VALIDATION_ERROR","message":"Los datos no son válidos.","details":[{"field":"title","message":"Too small: expected string to have >=3 characters"}],"requestId":"UUID-de-la-solicitud"}}
```

El texto de validación proviene de Zod y puede estar en inglés; `code` y el formato constituyen el contrato. Los errores internos nunca exponen stack traces al cliente.

| HTTP | Código | Causa |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_ID`, `INVALID_VERSION` | Sintaxis o encabezado incorrectos |
| 401 | `AUTH_REQUIRED`, `INVALID_CREDENTIALS` | Sesión ausente/vencida o login incorrecto |
| 403 | `CSRF_INVALID` | Token ausente o no correspondiente a la sesión |
| 404 | `TASK_NOT_FOUND`, `ROUTE_NOT_FOUND` | Tarea propia o ruta inexistente |
| 405 | `METHOD_NOT_ALLOWED` | Método no admitido para el recurso tasks |
| 409 | `DUPLICATE_TITLE`, `USERNAME_TAKEN` | Conflicto de unicidad |
| 412 | `VERSION_CONFLICT` | Otra edición actualizó la versión |
| 413 | `PAYLOAD_TOO_LARGE` | Más de 16 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Escritura con cuerpo sin tipo JSON |
| 422 | `VALIDATION_ERROR` | Objeto/campos no válidos |
| 428 | `PRECONDITION_REQUIRED` | Falta If-Match para editar/eliminar |
| 429 | `RATE_LIMITED` | Exceso de autenticaciones; incluye Retry-After |
| 500 | `INTERNAL_ERROR` | Error no controlado, registrado en el servidor |
