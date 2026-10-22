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

Los comprobantes PDF se generan y descargan localmente a partir de los registros. No son adjuntos permanentes ni forman parte del respaldo JSON; pueden descargarse nuevamente desde el historial. El PDF excluye las notas privadas del cliente y del servicio. Para comprobantes anteriores se utiliza la recomendación de mantenimiento vigente al descargarlos, identificada en el documento, sin alterar el servicio original.

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
