# Demostración reproducible

**Repositorio:** https://github.com/bianchi-navarro/tareas-api-aplicaciones-web-u2  
**Modalidad:** ejecución local; no hay servidor público desplegado.  
**URL después de iniciar:** http://127.0.0.1:3000

## Preparación

Con Node.js 22.20.0: ejecutar `npm ci` y `npm run demo` en la carpeta del repositorio. Abrir la URL local y acceder con `demo` / `RumboDemo2026!`. El modo de demostración genera cuatro tareas y escucha solo en localhost. Las credenciales son exclusivamente de ejemplo; el sistema normal (`npm start`) permite registrar una cuenta propia.

## Recorrido para la presentación (4-5 minutos)

1. Mostrar el tablero y sus estados: pendientes, en progreso y completadas. Explicar que usa la misma API REST que las pruebas.
2. Abrir una segunda pestaña con la misma URL y sesión. Crear una tarea en la primera y comprobar que aparece en la segunda sin recargar: evento SSE `task.changed`.
3. Editar título, descripción, prioridad y estado. La versión aumenta y el tablero mueve la tarjeta a la columna correspondiente.
4. Intentar un título duplicado: la interfaz muestra el conflicto 409 y conserva los datos existentes.
5. Abrir el formulario de la misma tarea en dos pestañas. Guardar en una; intentar guardar la versión anterior en la otra: 412. Cerrar y abrir de nuevo el formulario para tomar la versión actual.
6. Descargar **Exportar JSON** y revisar la estructura `{data:[...]}`. Eliminar una tarea desde su tarjeta y confirmar.
7. Reiniciar `npm run demo` y acceder de nuevo: los cambios de tareas se conservan en SQLite. La sesión solo se mantiene entre procesos si se configura un secreto estable.
8. Cerrar sesión y comprobar que la interfaz vuelve al acceso; las rutas privadas dejan de estar disponibles. Ejecutar `npm test` para mostrar los casos de validación, acceso, concurrencia y SSE.

## Evidencias incluidas

- [Tablero funcionando](evidencias/tablero.jpg)
- [Acceso a la aplicación](evidencias/acceso.jpg)
- [Cambio recibido en la segunda pestaña](evidencias/tiempo-real.jpg)
- [Ejecución de las 27 pruebas y cobertura](evidencias/pruebas.txt)
- [Postman: 24 solicitudes y 41 aserciones aprobadas](evidencias/postman.json)
- [Transcripción de solicitudes HTTP reales sin cookies ni secretos](evidencias/solicitudes.json)
- [Colección Postman con comprobaciones](Tareas_U2.postman_collection.json)

Las capturas corresponden a la ejecución local real. Las pruebas automatizadas usan bases temporales independientes e incluyen el cierre y reapertura de SQLite y conexiones SSE reales. Los resultados en GitHub Actions se pueden consultar en la pestaña **Actions** del repositorio.

## Para explicar el código

- `domain/validation.js`: validación y transformaciones puras sin E/S ni modificación del objeto recibido.
- `infrastructure/task-repository.js`: persistencia y SQL parametrizado; comparación atómica de versiones.
- `services/task-service.js`: primero confirma la escritura y después publica el evento.
- `http/routes.js`: traduce la petición a una operación y utiliza estados y encabezados HTTP apropiados.
- `infrastructure/session-store.js`: sesiones almacenadas en SQLite, con expiración.
- `infrastructure/events.js`: entrega de eventos por usuario y cierre de conexiones revocadas.

## Límites de la demostración

Aplicación de un solo proceso, SSE efímero y SQLite local. No se afirma disponibilidad pública ni se requiere un servicio de pago. Para producción se necesita HTTPS y almacenamiento persistente; para varias instancias, un canal de eventos y limitador compartidos.
