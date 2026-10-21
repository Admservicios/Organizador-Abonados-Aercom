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

El esquema completo está en `src/lib/localDatabase.ts`. No agregar contraseñas, tokens, sesiones o archivos codificados a este documento.

## Respaldo descargable

El archivo usa `format: motortrack-backup`, `version: 1`, una fecha `exportedAt` y el mismo campo `data`. No incluye credenciales ni archivos. Se admite como máximo un archivo de 5 MB, sujeto además a la cuota disponible del navegador.

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
