# Plan de Taller Calamante

## Decisión vigente

El usuario autorizó preparar una aplicación instalable para la PC del taller, con base SQLite y acceso privado desde celulares. Esta modalidad centraliza registros y adjuntos en la PC y se desarrolla en GitHub; no necesita GitHub para funcionar una vez instalada.

Se conserva además la modalidad de GitHub Pages, que guarda sus registros en el navegador. La migración a la PC se realiza explícitamente mediante un ZIP completo y no borra la base original. El acceso real de clientes desde internet y los QR revocables se implementarán después de configurar el acceso externo seguro. Ver [instalación en PC](INSTALACION-PC.md).

## Entregas

| Paso                  | Alcance                                                                               | Validación                                                         |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Base visual           | Dashboard, Clientes, Vehículos, Mantenimientos, Próximos servicios, Backups y Ajustes | Recorridos de escritorio y celular                                 |
| Base local            | Persistencia versionada de clientes, vehículos, mantenimientos y datos del taller     | Guardar, recargar y recuperar los mismos registros                 |
| Recuperación local    | Exportación JSON, estructura validada, confirmación y copia previa                    | Exportar, modificar y restaurar el estado anterior                 |
| Operación ampliada    | Fotografías permanentes, documentos, PDF y varias recomendaciones por vehículo        | Pruebas sobre cada capacidad implementada                          |
| Distribución          | Publicación estática, instalación y uso sin conexión                                  | Comprobación de rutas, recursos, trabajo sin red y actualizaciones |
| Funciones compartidas | Evaluar sincronización, usuarios e historial público real                             | Arquitectura y autorización específicas antes de implementarlas    |

## Estado inicial de la base

La base visual, la persistencia local y la recuperación JSON están implementadas. La operación ampliada avanza con **comprobantes PDF de mantenimiento**: descarga al registrar y desde los historiales, generación local, notas privadas excluidas y textos largos distribuidos entre páginas. También están implementadas las fotografías persistentes por mantenimiento, la galería del vehículo y el respaldo ZIP completo con verificación de archivos. También están implementados los vencimientos independientes por tipo de servicio y su edición en Recordatorios. Está implementada la documentación PDF e imágenes JPG / PNG / WebP por vehículo, con vista previa de imágenes, edición, descarga original, retiro confirmado y respaldo ZIP completo. También están implementados la instalación como aplicación y el uso sin conexión tras la primera preparación. La edición completa de mantenimientos actualiza las fichas, historiales y vencimientos relacionados y conserva los archivos. También están disponibles los ZIP automáticos en una carpeta autorizada del equipo, con intervalo y verificación de escritura, mientras la aplicación permanece abierta. Quedan pendientes otros formatos y las funciones compartidas.

- Formato `motortrack-local`, versión 1.
- Una unidad de `localStorage` contiene clientes, vehículos, mantenimientos, taller y referencias de fotos y documentos. IndexedDB conserva las imágenes optimizadas y los documentos originales, en colecciones locales identificadas.
- Validación de identificadores, relaciones, patentes y kilometraje antes de guardar o restaurar.
- Revisión para detectar escrituras basadas en un estado anterior.
- Modo local vacío y demostración separada.
- La modalidad navegador sigue sin requerir servicios contratados. La modalidad PC utiliza SQLite, contraseña privada, sesiones, guardados con revisión y copias completas.

## Reglas funcionales

- Cliente activo/inactivo es independiente del mantenimiento al día/próximo/vencido.
- Vence al alcanzar fecha o kilometraje, lo que ocurra primero. Se avisa hasta 30 días o 1.000 km antes.
- En modo local se usa la fecha actual de Argentina; la demo conserva 21 de octubre de 2026 como referencia.
- El kilometraje representa el último dato registrado; no una medición en vivo.
- Cada vehículo tiene vencimientos independientes por tipo. Registrar un servicio modifica solo su seguimiento y conserva los demás; actualizar el odómetro puede volver vencido otro servicio sin reiniciarlo. Los registros anteriores conservan su único vencimiento almacenado hasta que el usuario lo revise o lo renueve.
- Los comprobantes de nuevos servicios conservan su vencimiento histórico. En registros anteriores se usa únicamente el vencimiento vigente del mismo tipo, identificado como tal; no se reconstruyen intervalos históricos perdidos.
- Los importes actuales se expresan en pesos. Antes de integrar contabilidad o facturación se revisará su representación monetaria.
- No se publican datos locales mediante las rutas de demostración del QR.

## Recuperación pendiente de ampliación

La exportación/restauración JSON abarca registros y datos del taller. El ZIP completo incluye fotos optimizadas y documentos originales PDF / JPG / PNG / WebP, con integridad y límites de tamaño verificados. Las copias automáticas en carpeta están disponibles como opción local en navegadores compatibles; no se ejecutan con la aplicación cerrada. Siguen pendientes otros formatos de adjuntos. Los JSON anteriores siguen siendo compatibles y no contienen archivos adjuntos.

La copia anterior a una restauración permanece en el mismo navegador y puede perderse junto con él. Por eso se requiere una descarga conservada fuera del navegador. Las copias automáticas requieren una carpeta autorizada y la aplicación abierta. Una carpeta en el mismo disco no protege contra la pérdida del dispositivo.

## Autorización

El usuario autorizó implementar la base local y subir la estructura a GitHub para mejorarla progresivamente. Después informó una pantalla en blanco en su sitio de GitHub Pages. Se publican `dist` desde Actions y una copia compilada en la raíz de `main`, manteniendo el mismo origen web. Ambas variantes se prueban en un navegador con un servidor estático sin Vite; antes de subir código se ejecuta `npm run publish:static`. Esto cubre la configuración existente de Pages desde la rama, incluso cuando el token de Actions no puede cambiar su origen. El usuario autorizó la preparación de la modalidad PC, SQLite, acceso privado desde celulares y empaquetado Windows. El despliegue de un acceso por internet y los enlaces públicos reales se harán en una etapa posterior. No se modificarán otros proyectos ni se subirán registros reales al repositorio.

## Modalidad PC incorporada

- Servidor privado con SQLite y archivos incluidos en transacciones, sesiones y habilitación de la red desde la PC.
- Misma interfaz, con confirmación del guardado en el servidor, controles de conflictos y sin sustitución por una base vacía si no hay conexión.
- Importación de ZIP existentes, descarga de copias completas y copia previa. Copias automáticas verificadas en la carpeta de datos.
- Compilación independiente del servidor, carpeta portable y workflow de instalador Windows con runtime incluido. Datos fuera de la carpeta del programa.
- Pendiente: instalación interactiva y verificación del firewall en la PC real; acceso externo HTTPS, QR reales para clientes y cuentas individuales con roles.
