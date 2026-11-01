# Demostración de la aplicación

**Repositorio:** https://github.com/bianchi-navarro/tareas-api-aplicaciones-web-u2  
**Ejecución:** local.  
**Dirección de acceso:** http://127.0.0.1:3000

## Preparación

Con Node.js 22.20.0 instalado, se ejecutan `npm ci` y `npm run demo` dentro de la carpeta del proyecto. Después se abre la dirección local en el navegador y se ingresa con el usuario `demo` y la contraseña `RumboDemo2026!`.

Este modo carga cuatro tareas de ejemplo para revisar el tablero y funciona únicamente en la computadora donde se inicia el servidor. Para comenzar sin esos datos y registrar una cuenta propia, se puede usar `npm start`.

## Pasos para revisar el funcionamiento

1. Revisar las tres columnas del tablero: pendientes, en progreso y completadas. Las acciones de esta pantalla se realizan a través de la API REST.
2. Abrir la misma dirección en una segunda pestaña. Crear una tarea en la primera y comprobar que también aparece en la segunda sin recargar. El cambio llega mediante el evento SSE `task.changed`.
3. Editar una tarea y cambiar su descripción, prioridad o estado. Al guardar, aumenta su versión y la tarjeta pasa a la columna del estado elegido.
4. Crear otra tarea con un título que ya exista. La aplicación debe mostrar el error de duplicado (`409`) y conservar la tarea anterior.
5. Abrir la edición de una misma tarea en las dos pestañas. Guardar primero en una y luego intentar guardar en la otra. El segundo cambio debe rechazarse con `412`, porque usa una versión anterior. Para continuar, se cierra y se vuelve a abrir el formulario.
6. Usar **Exportar JSON** y revisar que el archivo contenga las tareas dentro de `data`. Después, eliminar una tarea desde el tablero y comprobar que se solicita confirmación.
7. Detener el servidor y volver a ejecutar `npm run demo`. Los cambios deben conservarse en SQLite. Para mantener también la sesión entre reinicios es necesario configurar un `SESSION_SECRET` estable.
8. Cerrar sesión y comprobar que se vuelve a la pantalla de acceso. Finalmente, ejecutar `npm test` para revisar los casos que no se observan directamente en el tablero, como el acceso a tareas de otro usuario y los errores de las rutas.

## Evidencias del trabajo

- [Tablero funcionando](evidencias/tablero.jpg)
- [Acceso a la aplicación](evidencias/acceso.jpg)
- [Cambio recibido en la segunda pestaña](evidencias/tiempo-real.jpg)
- [Ejecución de las 27 pruebas y cobertura](evidencias/pruebas.txt)
- [Postman: 24 solicitudes y 41 aserciones aprobadas](evidencias/postman.json)
- [Transcripción de solicitudes HTTP reales sin cookies ni secretos](evidencias/solicitudes.json)
- [Colección Postman con comprobaciones](Tareas_U2.postman_collection.json)

Las capturas muestran la aplicación ejecutándose de forma local. Las pruebas automatizadas usan bases temporales e incluyen el cierre y la reapertura de SQLite, además de conexiones SSE. Sus resultados también se pueden revisar en la pestaña **Actions** de GitHub.

## Archivos que conviene revisar

- `domain/validation.js`: contiene las reglas de validación y las funciones que transforman los datos sin modificar la entrada.
- `infrastructure/task-repository.js`: reúne las consultas SQL y comprueba la versión al modificar una tarea.
- `services/task-service.js`: guarda el cambio antes de enviar el evento al usuario.
- `http/routes.js`: define las rutas y las respuestas HTTP.
- `infrastructure/session-store.js`: guarda las sesiones en SQLite y controla su vencimiento.
- `infrastructure/events.js`: envía los eventos al usuario correspondiente y cierra las conexiones cuando la sesión deja de ser válida.

## Alcance

La demostración funciona en un solo proceso y utiliza una base SQLite local. Los eventos SSE se envían en el momento del cambio y no se guardan. Para llevar la aplicación a un servidor público habría que configurar HTTPS y almacenamiento permanente; si se usan varias instancias, también habría que compartir los eventos y el límite de intentos de acceso.
