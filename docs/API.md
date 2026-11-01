# Uso de la API

La dirección base es `http://127.0.0.1:3000/api`. Las fechas se devuelven en formato ISO 8601 y en UTC. La API desactiva la caché de sus respuestas para evitar que se consulten datos guardados por el navegador.

Las solicitudes que envían datos deben usar `Content-Type: application/json` y un cuerpo de hasta 16 KB. Para las operaciones de escritura se necesita la cookie de sesión y el encabezado `X-CSRF-Token`, incluso al registrarse o iniciar sesión. El token se obtiene con `GET /session` y cambia después de la autenticación.

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

Cada usuario puede acceder solo a sus propias tareas. Si intenta consultar una tarea de otra cuenta, recibe `404`. Cuando se usa un método no permitido en `/tasks` o `/tasks/:id`, la respuesta es `405` e incluye el encabezado `Allow`. Express también atiende `HEAD` para las rutas GET. No se configuró CORS porque la interfaz y la API se sirven desde el mismo origen.

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

Para usar `PUT` hay que enviar los cuatro campos editables. Con `PATCH` basta con enviar uno, pero el cuerpo no puede estar vacío. El identificador, el propietario, las fechas y la versión los controla el servidor; cualquier campo adicional se rechaza.

El listado `GET /tasks` permite filtrar por `status`, `priority` y `q`, que busca en el título y admite hasta 120 caracteres. Para dividir el resultado en páginas se usan `limit` (de 1 a 99, con 50 por defecto) y `offset` (de 0 a 999999, con 0 por defecto). Las tareas se ordenan por ID descendente. La búsqueda trata el texto de forma literal, sin comodines SQL, y no se admiten parámetros desconocidos.

## Ejemplos de petición y respuesta

Los siguientes ejemplos usan `curl` en Bash. En PowerShell se puede usar `curl.exe`, o importar la colección en Postman. El archivo `cookies.txt` conserva la sesión entre solicitudes y debe guardarse fuera del repositorio. Los tokens y los identificadores de los ejemplos se reemplazan por los que devuelva la aplicación.

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

Si el registro se completa, la API responde **201**, inicia la sesión y renueva la cookie. Para entrar con una cuenta que ya existe, se envían los mismos campos a `/auth/login`; en ese caso la respuesta correcta es **200**.

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

Al crear la tarea se recibe **201**, junto con `Location: /api/tasks/1` y `ETag: "1"`. El ID y las fechas de esta respuesta son de ejemplo:

```json
{"data":{"id":1,"title":"Entregar API","description":"","status":"pendiente","priority":"alta","version":1,"createdAt":"2026-10-31T20:00:00.000Z","updatedAt":"2026-10-31T20:00:00.000Z"}}
```

```sh
curl -i -b cookies.txt http://127.0.0.1:3000/api/tasks/1
curl -i -b cookies.txt 'http://127.0.0.1:3000/api/tasks?status=pendiente&priority=alta&limit=10&offset=0'
```

El listado devuelve **200** y separa las tareas de los datos de paginación: `{"data":[...],"meta":{"total":1,"limit":10,"offset":0}}`. Al consultar una sola tarea, la respuesta tiene la forma `{data:{...}}` e incluye su ETag actual.

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

Las dos solicitudes devuelven **200** con la tarea actualizada y un nuevo ETag. En este ejemplo, el `PUT` deja la tarea en la versión 2 y el `PATCH` en la versión 3. Si se intenta guardar con una versión anterior, se recibe **412**. Antes de volver a editar hay que consultar la tarea para obtener su versión actual.

### 5. Exportar, eliminar y salir

```sh
curl -b cookies.txt -o tareas.json http://127.0.0.1:3000/api/tasks/export
curl -i -X DELETE -b cookies.txt -H 'X-CSRF-Token: TOKEN_AUTENTICADO' \
  -H 'If-Match: "3"' http://127.0.0.1:3000/api/tasks/1
curl -i -X POST -b cookies.txt -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: TOKEN_AUTENTICADO' -d '{}' \
  http://127.0.0.1:3000/api/auth/logout
```

La exportación responde **200** y usa `Content-Disposition: attachment; filename=tareas.json` para descargar el archivo con la estructura `{data:[...]}`. Tanto la eliminación como el cierre de sesión responden **204**, sin contenido en el cuerpo.

### 6. Observar cambios en tiempo real

Para observar los eventos, se ejecuta este comando en otra terminal antes de crear o modificar una tarea:

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

Los eventos indican si una tarea fue creada (`created`), modificada (`updated`) o eliminada (`deleted`). Al eliminarla, `task` contiene únicamente el `id`. Cada 15 segundos se envía un comentario SSE para mantener la conexión y comprobar la sesión; también se verifica la sesión antes de enviar un evento. Al cerrar sesión se revoca el acceso. Si una sesión vence mientras la conexión está inactiva, esta se cierra en la siguiente comprobación.

Esta ruta solo consulta información, por lo que no necesita un token CSRF. En el navegador, `EventSource('/api/events')` envía la cookie del mismo origen. Los eventos no quedan guardados: cuando se recupera una conexión, el cliente consulta de nuevo el listado para ponerse al día.

## Respuestas de error

```json
{"error":{"code":"VALIDATION_ERROR","message":"Los datos no son válidos.","details":[{"field":"title","message":"Too small: expected string to have >=3 characters"}],"requestId":"UUID-de-la-solicitud"}}
```

Todos los errores mantienen esta estructura. El mensaje de validación lo genera Zod y puede aparecer en inglés; para identificar el problema desde otra aplicación conviene usar el campo `code`. Si ocurre un error interno, el servidor lo registra sin enviar la traza al cliente.

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
