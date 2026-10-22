# Plan de Taller Calamante

## Decisión vigente

El usuario pidió una base local como el CRM de Aercom. El historial del repositorio confirma que ese CRM usaba `localStorage`. Taller Calamante adopta persistencia en el navegador y deja Supabase fuera de esta versión.

GitHub versiona código, esquemas y pruebas. Los registros personales del taller permanecen en cada navegador y se trasladan mediante respaldos descargados. Este modelo no proporciona autenticación, colaboración ni sincronización.

## Entregas

| Paso                  | Alcance                                                                               | Validación                                                            |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Base visual           | Dashboard, Clientes, Vehículos, Mantenimientos, Próximos servicios, Backups y Ajustes | Recorridos de escritorio y celular                                    |
| Base local            | Persistencia versionada de clientes, vehículos, mantenimientos y datos del taller     | Guardar, recargar y recuperar los mismos registros                    |
| Recuperación local    | Exportación JSON, estructura validada, confirmación y copia previa                    | Exportar, modificar y restaurar el estado anterior                    |
| Operación ampliada    | Fotografías permanentes, documentos, PDF y varias recomendaciones por vehículo        | Pruebas sobre cada capacidad implementada                             |
| Distribución          | Publicación estática y evolución desde GitHub                                         | Comprobación de rutas, recursos y conservación de datos al actualizar |
| Funciones compartidas | Evaluar sincronización, usuarios e historial público real                             | Arquitectura y autorización específicas antes de implementarlas       |

## Estado inicial de la base

La base visual, la persistencia local y la recuperación JSON están implementadas. La operación ampliada avanza con **comprobantes PDF de mantenimiento**: descarga al registrar y desde los historiales, generación local, notas privadas excluidas y textos largos distribuidos entre páginas. También están implementadas las fotografías persistentes por mantenimiento, la galería del vehículo y el respaldo ZIP completo con verificación de archivos. También están implementados los vencimientos independientes por tipo de servicio y su edición en Recordatorios. Está implementada la documentación PDF por vehículo con descarga, retiro confirmado y respaldo ZIP completo. Quedan pendientes otros formatos, la PWA y el uso sin conexión.

- Formato `motortrack-local`, versión 1.
- Una unidad de `localStorage` contiene clientes, vehículos, mantenimientos, taller y referencias de fotos y documentos. IndexedDB conserva las imágenes optimizadas y los PDF originales, en colecciones locales identificadas.
- Validación de identificadores, relaciones, patentes y kilometraje antes de guardar o restaurar.
- Revisión para detectar escrituras basadas en un estado anterior.
- Modo local vacío y demostración separada.
- Sin migraciones SQL, secretos administrativos ni servicios contratados.

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

La exportación/restauración JSON abarca registros y datos del taller. El ZIP completo incluye fotos optimizadas y documentos PDF originales, con integridad y límites de tamaño verificados. Siguen pendientes otros formatos de adjuntos y copias automáticas independientes. Los JSON anteriores siguen siendo compatibles y no contienen archivos adjuntos.

La copia anterior a una restauración permanece en el mismo navegador y puede perderse junto con él. Por eso se requiere una descarga conservada fuera del navegador. No hay promesa de retención automática ni protección contra pérdida del dispositivo.

## Autorización

El usuario autorizó implementar la base local y subir la estructura a GitHub para mejorarla progresivamente. Después informó una pantalla en blanco en su sitio de GitHub Pages. Se publican `dist` desde Actions y una copia compilada en la raíz de `main`, manteniendo el mismo origen web. Ambas variantes se prueban en un navegador con un servidor estático sin Vite; antes de subir código se ejecuta `npm run publish:static`. Esto cubre la configuración existente de Pages desde la rama, incluso cuando el token de Actions no puede cambiar su origen. Las nuevas funciones compartidas requieren una autorización específica. No se modificarán otros proyectos ni se subirán registros reales al repositorio.
