# Datos locales y recuperación

## Ubicación y alcance

Taller Calamante usa la clave `motortrack-local-database-v1` en `localStorage`, dentro del perfil y origen web del navegador. No genera una base en el servidor ni en GitHub. La aplicación descargada sigue necesitando un servidor estático para abrirse; una PWA instalable es un paso futuro.

La base es un documento JSON validado con Zod, no una base SQL. Clientes, vehículos, servicios y datos del taller se escriben juntos con una sola operación de almacenamiento. No se muestra un guardado exitoso hasta que esa operación termina.

El modo demo usa otra colección en memoria y no copia ejemplos a la base real. La preferencia local/demo se guarda en `motortrack-view-mode`. Las claves de Taller Calamante son distintas de `aercom-data`; no se lee ni modifica esa base del CRM anterior.

## Esquema interno v1

```json
{
  "format": "motortrack-local",
  "version": 1,
  "revision": 1,
  "updatedAt": "2026-10-21T20:00:00.000Z",
  "data": {
    "customers": [],
    "vehicles": [],
    "services": [],
    "workshop": {
      "name": "Mi taller",
      "phone": "",
      "email": "",
      "address": "",
      "currency": "ARS",
      "timezone": "America/Argentina/Buenos_Aires"
    }
  }
}
```

El esquema completo está en `src/lib/localDatabase.ts`. No agregar contraseñas, tokens, sesiones o archivos codificados a este documento. Los campos opcionales `photoSet` y `photos` identifican una colección y sus referencias (servicio, nombre, dimensiones, tamaño y SHA-256); no contienen imágenes. Su ausencia conserva la compatibilidad con los datos y respaldos anteriores.

## Respaldo descargable

El archivo usa `format: motortrack-backup`, `version: 1`, una fecha `exportedAt` y el mismo campo `data`. No incluye credenciales ni archivos. Se admite como máximo un archivo de 5 MB, sujeto además a la cuota disponible del navegador.

Los comprobantes PDF se generan y descargan localmente a partir de los registros. No son adjuntos permanentes ni forman parte del respaldo JSON; pueden descargarse nuevamente desde el historial. El PDF excluye las notas privadas del cliente y del servicio. Los nuevos servicios conservan su vencimiento propio en `maintenance`; los PDFs usan esa copia histórica. Para servicios anteriores, sin esa copia, solo se consulta el seguimiento vigente del mismo tipo, sin alterar el registro original.

La validación comprueba formato y relaciones; no es una firma digital ni permite demostrar quién creó el archivo. Se rechazan versiones desconocidas, campos no previstos, identificadores duplicados, patentes repetidas y relaciones inexistentes.

## Restauración

1. Seleccionar un JSON en Backups.
2. Revisar el taller y los conteos del archivo validado.
3. Descargar la base actual si se desea una copia independiente.
4. Confirmar expresamente el reemplazo completo. No se mezclan datos.
5. La aplicación conserva el contenido anterior bajo `motortrack-before-restore-v1` antes de sustituirlo. Si no puede guardar esa copia o la nueva base, conserva la base anterior.
6. Volver a consultar los registros y descargar un nuevo respaldo si corresponde.

Las copias internas previas válidas se pueden descargar y restaurar desde la misma pantalla. Si la base no se puede interpretar, no se sobrescribe automáticamente; la opción de descarga sin modificar conserva los bytes legibles para una recuperación asistida. Un archivo realmente dañado puede requerir intervención y no siempre es recuperable.

## Cambio de computadora o dirección web

Exportar desde el origen anterior. Abrir la aplicación en el destino y restaurar el JSON. Una copia del código del repositorio no incluye los datos del navegador anterior.

Un sitio servido con otra combinación de protocolo, hostname o puerto usa un almacenamiento diferente. Las actualizaciones deben conservar una dirección estable. Todos los caminos del mismo origen comparten `localStorage`; las claves están prefijadas para Taller Calamante, pero no deben utilizarse para aislar usuarios o talleres.

## Capacidad y concurrencia

El tamaño disponible depende del navegador. Un fallo de cuota o acceso bloqueado conserva la base anterior y mantiene el formulario abierto. Usar una sola pestaña para editar: las notificaciones y revisiones no equivalen a un sistema de edición colaborativa ni eliminan todas las condiciones de carrera.

Quien tiene acceso al perfil del navegador puede leer sus registros. No hay cuentas, roles efectivos, cifrado con contraseña ni sincronización. El acceso público real por QR necesita un servicio independiente o un mecanismo de publicación que todavía no está implementado.

## Fotografías y ZIP completo

Las imágenes optimizadas se guardan como `Blob` en la base IndexedDB `motortrack-photos-v1`, objeto `photos`, separadas del JSON. La clave de cada foto es un UUID; `setId` identifica la colección y `serviceId` vincula el mantenimiento. Se validan archivos JPEG, dimensiones y hash antes de persistirlos. No se incorporan originales ni fotografías a GitHub.

El guardado escribe primero las nuevas fotos en una transacción de IndexedDB y luego confirma el documento local con sus referencias y su revisión. Si falla el segundo paso se retiran únicamente los archivos recién agregados; el estado anterior no se reemplaza. Una interrupción entre esos pasos puede dejar archivos sin referencia: no se muestran ni se exportan, y no se borran colecciones anteriores automáticamente.

El respaldo ZIP contiene un `backup.json` validado y `photos/<id>.jpg`. Se comprueba el tamaño declarado antes de descomprimir, las referencias, las dimensiones y SHA-256 de cada archivo. SHA-256 detecta discrepancias; no autentica al autor del respaldo. Límites: 100 MB comprimidos y descomprimidos, JSON de hasta 5 MB, hasta 1.000 fotos en la base y 6 por mantenimiento. Cada foto optimizada pesa hasta 350 KB y mide hasta 1.600 píxeles de lado.

Al restaurar un ZIP, se validan las imágenes y se escribe una colección nueva con identificadores nuevos antes de confirmar los registros. Si falla la escritura de registros, se retiran las fotos recién preparadas y se conserva la base previa. La copia anterior de `localStorage` conserva sus referencias a las fotos originales, que permanecen en IndexedDB. Esa copia solo funciona completa en el mismo navegador; para trasladarla hacen falta los archivos en un ZIP independiente.

Los JSON solo trasladan registros. Si incluyen referencias a fotos ausentes en el navegador de destino, los registros pueden recuperarse, pero la galería informa que necesita el ZIP completo. El exportador de ZIP rechaza un respaldo incompleto cuando faltan imágenes referenciadas. Los PDFs no incorporan estas fotografías. La demo mantiene sus fotos exclusivamente en memoria y las descarta al recargar.

## Vencimientos por tipo de servicio

La versión 1 admite ahora los campos opcionales `vehicle.maintenancePlans` y `service.maintenance`. Las bases y respaldos sin esos campos se leen sin una migración destructiva. Cada plan tiene una categoría estable, etiqueta, fecha y kilometraje objetivo, recomendación y, cuando se conoce, fecha/kilometraje del último trabajo del mismo tipo. No se guardan dos planes con la misma categoría en un vehículo.

Las categorías de service de aceite/filtros, filtros por separado, frenos, alineación/balanceo, neumáticos y revisión general son independientes. Los servicios con nombre propio generan categorías separadas. Registrar un mantenimiento reemplaza únicamente el plan de su categoría y guarda una copia en el servicio; el odómetro general se actualiza, mientras los demás límites y últimos trabajos permanecen intactos. Los estados se calculan con ese odómetro actual y cada límite propio. El resumen del vehículo toma el estado más urgente; la agenda y el contador de pendientes cuentan servicios, no solo vehículos.

Los campos históricos `nextDate`, `nextKm` y `recommendation` se mantienen como resumen compatible. Cuando existen planes, las pantallas derivan los valores de ellos, sin recalcular límites desde el odómetro actual. Sin planes, se conserva el único vencimiento anterior, marcado `legacy`. Solo se completa la referencia del último trabajo a partir de un registro existente del mismo tipo y sin modificar sus datos; no se inventa un intervalo perdido. El usuario puede ajustar los planes desde Recordatorios, sin registrar un servicio ficticio. Se admite corregir un vencimiento ya pasado, siempre posterior al último trabajo conocido de ese tipo.

Las copias JSON y ZIP incluyen los planes y las copias históricas de los nuevos servicios. La edición del odómetro conserva esos planes; fotos, clientes e historial no se reescriben al ajustar un vencimiento.

## Documentos PDF por vehículo

Campos opcionales compatibles con la versión 1: `documentSet` (UUID de colección) y `documents` (referencias con UUID, `vehicleId`, nombre, categoría, fecha de carga, tamaño y SHA-256). Se validan relaciones, duplicados y límites de 20 por vehículo, 200 en total y 5 MB por archivo. Los PDF originales se conservan como Blob en IndexedDB `motortrack-documents-v1`, objeto `documents`; no se codifican en el JSON ni se publican en GitHub.

La carga revisa tamaño, encabezado y final PDF e integridad; no implica validar el contenido documental ni comprobar su vigencia. Solo se descargan, sin ejecución ni visor integrado. Se escribe primero el archivo y luego la referencia mediante el guardado habitual con control de revisión. Si falla la confirmación, se retira únicamente el archivo nuevo. Quitar un documento de la ficha requiere confirmación y retira su referencia: el Blob se conserva para no invalidar copias previas; no hay borrado físico ni limpieza automática de archivos sin referencia.

El ZIP incluye `documents/<id>.pdf`; sus límites globales siguen siendo 100 MB comprimidos y descomprimidos. La lectura rechaza archivos ausentes, adulterados, adicionales o que excedan los límites declarados antes de descomprimir. Al restaurar se preparan fotos y documentos con colecciones e identificadores nuevos antes de confirmar los registros. Si falla cualquiera de las escrituras, se retiran los archivos nuevos y se conserva la base anterior con sus archivos. Los JSON con referencias conservan acceso solo si esos archivos todavía existen en ese navegador. Si faltan, se informa el error al descargar y se impide crear un ZIP incompleto.

La demo solo conserva documentos en memoria. El historial público no accede a documentos reales. No hay alertas de vencimiento de documentos en esta entrega.

## Aplicación instalable y caché de la interfaz

El service worker del mismo subdirectorio prepara HTML, manifiesto, iconos y todos los módulos de la compilación, incluidos PDF y ZIP. El caché almacena recursos de interfaz: los registros permanecen en `localStorage` y los archivos en sus bases IndexedDB originales. No se renombran claves, no se crea otra base y no hay sincronización ni envío de datos al instalar.

La preparación requiere internet, HTTPS o localhost y soporte del navegador. Si no termina, se informa y se puede reintentar desde Ajustes → Aplicación. Un caché de interfaz no reemplaza el ZIP: el navegador puede retirar almacenamiento y distintas instalaciones/perfiles pueden usar contenedores de datos diferentes.

Cada versión tiene un caché con prefijo propio de la aplicación y de su ruta. Se confirma la preparación completa antes de activar; un fallo retira solo el caché nuevo. Se conservan versiones anteriores para que las pestañas abiertas puedan seguir cargando sus módulos; pueden acumular espacio. No se borran cachés de otras aplicaciones del mismo origen. La nueva versión espera confirmación y no recarga otras pestañas. Esas pestañas conservan sus formularios hasta que el usuario guarda y decide recargar. El control de revisión y las reglas para una pestaña de edición a la vez siguen vigentes.

## Copias automáticas en carpeta autorizada

`motortrack-backup-folder-v1` es una base IndexedDB separada que contiene el handle de carpeta, activación, intervalo (15, 60 o 1.440 minutos) y metadatos de la última copia verificada. No se guardan rutas del sistema ni permisos en el JSON de negocio ni en el ZIP. Quitar esta configuración no elimina archivos. Se usa File System Access exclusivamente tras una selección explícita del usuario; no se reemplaza por OPFS en producción. En navegadores sin selector o Web Locks se conserva el flujo manual.

El coordinador solo se ejecuta en modo local, fuera del historial público, al iniciar/volver, al detectar cambios y cada minuto mientras el navegador permite ejecutar la aplicación. El intervalo limita las copias con cambios; una huella SHA-256 del estado local permite evitar duplicados sin cambios. El job lee una instantánea fresca y validada de `localStorage`. Los archivos referenciados se conservan por las reglas existentes de fotos/documentos, por lo que los cambios concurrentes no retiran esos archivos durante la creación.

Web Locks serializa las copias y los cambios de configuración entre pestañas; cada copia automática vuelve a leer configuración y última huella bajo el bloqueo. BroadcastChannel actualiza su estado visual. Se revisa `queryPermission` antes de escribir: un estado prompt/denied requiere un botón del usuario para `requestPermission`. La demo y las vistas públicas no generan copias. La conexión de red no es necesaria para escribir una vez preparada la aplicación.

Cada ZIP lleva nombre nuevo, fecha de Argentina y sufijo aleatorio. Se rechaza un nombre ya existente antes de abrir una escritura. Después de cerrar el archivo se leen tamaño e integridad para confirmar el resultado. Si falla una escritura se intenta retirar únicamente el archivo nuevo incompleto. Nunca se enumeran ni limpian copias anteriores. Si falla el registro de metadatos tras verificar el archivo, se conserva la copia válida y se informa el problema. Un error suspende reintentos automáticos de esa sesión hasta que el usuario reintenta o vuelve a abrir la aplicación. Una interrupción del navegador puede dejar un archivo incompleto; la validación de restauración sigue vigente.

Se requiere un navegador de escritorio compatible y una carpeta autorizada. No es un servicio del sistema operativo: cerrar o suspender la aplicación impide prometer ejecuciones puntuales. La carpeta puede seguir existiendo si se borran los datos del navegador, pero el permiso debe configurarse de nuevo. Una carpeta en el mismo disco no protege frente a perderlo. La retención y el espacio de las copias se administran fuera de la aplicación.

Las pruebas de navegador sustituyen el diálogo del selector por un handle real de OPFS, solo en el entorno de prueba, para verificar clonación en IndexedDB, lectura/escritura y restauración de ZIP. Los permisos nativos y la selección de una carpeta del sistema requieren comprobación manual en un navegador compatible.
