# Instalación y uso sin conexión

## Preparar la aplicación

Abrir `https://admservicios.github.io/Taller-Calamante/` con internet, entrar en **Ajustes → Aplicación** y esperar **Lista para usar sin conexión**. La aplicación prepara también las herramientas de PDF y ZIP, aunque todavía no se hayan usado. Un aviso indica cuándo el navegador está sin conexión.

En Chrome o Edge se puede usar el botón **Instalar Taller Calamante** cuando el navegador lo ofrezca, o su menú de instalación. En Safari de iPhone/iPad se usa **Compartir → Agregar a inicio**. Los controles y la disponibilidad dependen del navegador y del dispositivo. Instalar no es obligatorio para trabajar sin conexión: la misma dirección del navegador funciona una vez preparada.

La primera apertura necesita internet. Abrir por primera vez una dirección o un perfil diferente sin internet no puede recuperar una aplicación que nunca se preparó allí. Si el navegador elimina el caché de la interfaz, hay que abrirla nuevamente con internet. Borrar todos los datos del sitio también afecta los registros y los archivos: conservar respaldos fuera del navegador.

## Datos y archivos

Después de preparar la aplicación se puede cerrar y volver a abrir sin red, consultar y cargar clientes, vehículos y mantenimientos, preparar fotos, guardar documentos, generar comprobantes PDF y exportar/restaurar respaldos. Los vencimientos siguen usando la fecha del dispositivo y el último kilometraje registrado. El aviso de conexión informa lo que detecta el navegador; no comprueba que un servidor remoto esté accesible.

La instalación no crea cuentas, sincronización ni un historial público real. Usar la dirección y el perfil donde están los registros. Algunas instalaciones, navegadores y perfiles pueden tener una base separada: descargar un **ZIP completo** desde la base original y restaurarlo en la nueva instalación si abre vacía. Los PDF y las fotos se trasladan con el ZIP, no con el JSON.

## Actualizaciones

Las actualizaciones se preparan con internet. Cuando una versión está completa aparece **Actualizar aplicación**. Guardar los formularios, revisar las otras pestañas y confirmar **Recargar y actualizar**. **Más tarde** permite seguir trabajando. La aplicación no recarga automáticamente otras pestañas que puedan contener trabajo pendiente.

La interfaz de una pestaña abierta puede seguir en la versión anterior hasta que se recargue. Los módulos de esa versión permanecen disponibles. Si una descarga queda incompleta se conserva la versión funcional y se informa el error. **Ajustes → Aplicación → Buscar actualizaciones** permite reintentar. Los registros, fotos y documentos permanecen en sus almacenamientos habituales.

## Desarrollo y publicación

`public/manifest.webmanifest` y `public/icons/` son las fuentes del manifiesto e iconos. Los PNG de 180, 192 y 512 píxeles se generaron desde el SVG de la marca. Los enlaces de `app.html` usan rutas de recursos públicos de Vite para que el manifiesto conserve su ubicación y el alcance de la aplicación bajo cualquier subdirectorio.

`scripts/prepare-offline.mjs` genera `dist/sw.js` desde `scripts/service-worker.js`, con un identificador derivado de los recursos y su lista de preparación. Se ejecuta antes de copiar los recursos históricos: prepara únicamente la compilación actual. `scripts/stage-static.mjs` copia también el worker, manifiesto e iconos a la raíz para Pages desde `main`. Esas copias son salidas generadas; editar sus fuentes y ejecutar `npm run publish:static`.

El worker usa cachés con prefijo propio y la ruta de su alcance. No ejecuta `skipWaiting` sin confirmación, no almacena solicitudes a otros orígenes y no elimina registros ni archivos. Las versiones de caché anteriores se conservan para no romper pestañas abiertas. La comprobación de cambios no fuerza una recarga. En el servidor de desarrollo no se registra el worker; se prueba con la distribución estática.

`npm run test:offline` sirve las variantes de raíz y `dist` con un servidor estático y comprueba con Chromium: manifiesto y dimensiones de iconos, apertura en una pestaña nueva sin red, persistencia, PDF y ZIP usados por primera vez sin internet, fotografías y documentos, restauración offline, actualización confirmada con otra pestaña en edición, conservación de cachés ajenos, descarga de actualización fallida y reintento de la primera preparación. La instalación en el sistema operativo y los menús específicos de cada dispositivo requieren una comprobación manual; no se simula una instalación real en estas pruebas.
