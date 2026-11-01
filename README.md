# Rumbo · API REST de tareas

**Aplicaciones Web · Unidad 2 · Programación del lado del servidor**  
Universidad Politécnica Salesiana · Bianchi Navarro

API funcional con **Node.js 22.20.0, Express 5, SQLite, sesiones persistentes y eventos SSE**, acompañada de un tablero web para demostrar el flujo completo.

![Tablero de demostración](docs/evidencias/tablero.jpg)

## Enlaces de la entrega

- [Repositorio](https://github.com/bianchi-navarro/tareas-api-aplicaciones-web-u2)
- [Informe técnico de dos páginas](docs/Navarro_Bianchi_AplWeb_U2.pdf)
- [Guion y evidencias de demostración](docs/DEMOSTRACION.md)
- [Contrato HTTP y ejemplos completos](docs/API.md)
- [Colección Postman](docs/Tareas_U2.postman_collection.json)
- [Ejecución automática en GitHub Actions](https://github.com/bianchi-navarro/tareas-api-aplicaciones-web-u2/actions)

La demostración es **local** en `http://127.0.0.1:3000`; no se presenta una URL de localhost como un despliegue público. El repositorio incluye las capturas, resultados de pruebas y un modo de demostración reproducible.

## Puesta en marcha

Instalar **Node.js 22.20.0** (o una versión 22 posterior) y Git. Esta versión dispone de `node:sqlite` sin banderas; puede emitir un aviso de módulo experimental.

```sh
git clone https://github.com/bianchi-navarro/tareas-api-aplicaciones-web-u2.git
cd tareas-api-aplicaciones-web-u2
npm ci
npm run demo
```

Abrir **http://127.0.0.1:3000**. Usuario local: **demo**. Contraseña de demostración: **RumboDemo2026!**. Se crean cuatro tareas en `data/demo.sqlite`. Este modo escucha exclusivamente en la interfaz local; no usar estas credenciales en servicios públicos. Los cambios se conservan entre ejecuciones y los datos iniciales solo se insertan si el tablero está vacío.

Para iniciar sin datos de ejemplo: `npm start`. Crear una cuenta desde la pantalla de acceso; la base se genera en `data/tareas.sqlite`. Para conservar también las sesiones entre reinicios, copiar `.env.example` a `.env` y definir un `SESSION_SECRET` aleatorio estable de al menos 32 caracteres. Sin secreto configurado, el modo de desarrollo genera uno por proceso y los usuarios vuelven a iniciar sesión después de reiniciar.

## Pruebas

```sh
npm test
npm run test:coverage
```

Las **27 pruebas** ejecutan solicitudes HTTP reales contra servidores en puertos efímeros, SQLite aislado y flujos SSE reales. Incluyen CRUD, validación, duplicados, concurrencia, SQL parametrizado, CSRF, sesiones, aislamiento entre usuarios, exportación, errores y persistencia después de cerrar y abrir la base de datos. No utilizan el archivo de datos de la aplicación. La cobertura usa el mecanismo de Node.js; no incluye la ejecución del navegador ni constituye una auditoría de seguridad.

La colección Postman se importa y se ejecuta en orden con Collection Runner; administra las cookies y los tokens automáticamente. Las pruebas de SSE y de reinicio se encuentran en la suite automatizada de Node.js.

La colección se verificó también mediante Newman: **24 solicitudes y 41 aserciones aprobadas**, con el resultado guardado en `docs/evidencias/postman.json`.

## Estructura y decisiones

```text
src/
  domain/           Esquemas Zod, errores y transformaciones puras
  http/             Rutas, controles de acceso y errores HTTP
  services/         Autenticación y coordinación de operaciones
  infrastructure/   SQLite, repositorios, almacén de sesiones y SSE
  app.js            Construcción de la aplicación, inyectable en pruebas
  server.js         Inicio del servidor
public/             Interfaz HTML, CSS y JavaScript sin compilación
scripts/demo.js     Demostración local con datos iniciales
test/               Pruebas HTTP, persistencia, SSE y funciones puras
docs/               Informe, contrato, colección y evidencias
```

- **Persistencia:** SQLite con tablas STRICT, claves foráneas, restricciones CHECK, índice y unicidad del título normalizado por propietario; consultas preparadas con parámetros.
- **CRUD:** `POST/GET /api/tasks`, `GET/PUT/PATCH/DELETE /api/tasks/:id`. `PUT` reemplaza todos los campos editables; `PATCH` solo los enviados. Los campos desconocidos se rechazan.
- **Concurrencia:** `ETag: "1"`; `If-Match` obligatorio al editar o eliminar. La actualización compara la versión en el mismo `UPDATE`. `428` si falta, `412` si quedó obsoleta y `409` ante un título duplicado.
- **Sesiones:** cookie de identificador `HttpOnly`, `SameSite=Strict`, duración de una hora y contenido almacenado en SQLite. Regeneración al autenticar, invalidación al salir y protección CSRF en las operaciones de escritura. Contraseñas con `scrypt`, sal aleatoria y comparación de tiempo constante. Límite de 30 intentos de autenticación por IP cada 15 minutos.
- **Tiempo real:** `GET /api/events` usa Server-Sent Events y publica `task.changed` después de persistir. Cada usuario recibe exclusivamente sus cambios. Heartbeat cada 15 s, cierre al salir y recarga completa del tablero al reconectar; no hay historial de eventos ni garantía de reproducción.
- **Archivo:** `GET /api/tasks/export` descarga un JSON de todas las tareas del usuario autenticado.
- **Interfaz:** usa `textContent` al mostrar datos, dispone de formularios accesibles, confirmación de eliminación, búsqueda y diseño adaptable. Las cookies nunca se almacenan en `localStorage`.

## Modelo de datos

`users(id, username UNIQUE, password_hash, created_at)`  
`tasks(id, owner_id FK, title, title_key, description, status, priority, version, created_at, updated_at)`  
`sessions(sid PK, data, expires_at)`

`UNIQUE(owner_id, title_key)` evita duplicados por usuario. Estados: `pendiente`, `en_progreso`, `completada`. Prioridades: `baja`, `media`, `alta`. Los registros devueltos no incluyen contraseñas ni identificadores de sesión.

## Configuración y alcance

| Variable | Valor por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `HOST` | `127.0.0.1` | Interfaz de escucha |
| `DB_PATH` | `./data/tareas.sqlite` | Persistencia |
| `SESSION_SECRET` | Aleatorio en desarrollo | Firma de cookies; usar uno estable y privado |
| `NODE_ENV` | Desarrollo | `production` exige secreto y activa cookie Secure |
| `TRUST_PROXY` | Desactivado | `1` únicamente detrás de un proxy HTTPS de confianza |

El proyecto académico funciona en un solo proceso. SSE y la limitación de intentos se coordinan en memoria, mientras tareas y sesiones se guardan en SQLite. Un despliegue público requiere HTTPS, disco persistente, copias de seguridad y configuración del proxy. Para varias instancias se necesita un bus de eventos y limitador compartidos. Los métodos síncronos de SQLite y `scrypt` se eligieron por simplicidad y escala de la demostración; una carga elevada requiere revisar esta decisión. No se implementan recuperación de contraseña, verificación de correo ni roles administrativos.

## Correspondencia con la rúbrica

| Criterio | Implementación y evidencia |
|---|---|
| HTTP y lógica funcional | Rutas coherentes, códigos, `Location`, `ETag`, funciones puras y capas; pruebas 01, 07, 10, 15, 25-27 |
| Persistencia y validación | SQLite, Zod, consultas preparadas, restricciones, conflictos; pruebas 08-13, 20 |
| Archivos, sesiones y tiempo real | Almacén SQLite, CSRF, exportación JSON y SSE por usuario; pruebas 02-06, 16-19, 21-22 |
| Pruebas, documentación y calidad | 27 pruebas, lockfile, CI, Postman, ejemplos, informe y demostración reproducible |

## Referencias

- Express.js. (s. f.). *5.x API reference*. https://expressjs.com/en/5x/api/
- Express.js. (s. f.). *Session middleware*. https://expressjs.com/en/resources/middleware/session/
- Node.js. (s. f.). *SQLite: Node.js v22.20.0 documentation*. https://nodejs.org/download/release/v22.20.0/docs/api/sqlite.html
