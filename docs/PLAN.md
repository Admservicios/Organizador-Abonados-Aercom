# Plan de MotorTrack

## Decisión vigente

El usuario pidió una base local como el CRM de Aercom. El historial del repositorio confirma que ese CRM usaba `localStorage`. MotorTrack adopta persistencia en el navegador y deja Supabase fuera de esta versión.

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

- Formato `motortrack-local`, versión 1.
- Una unidad de almacenamiento contiene clientes, vehículos, mantenimientos y taller.
- Validación de identificadores, relaciones, patentes y kilometraje antes de guardar o restaurar.
- Revisión para detectar escrituras basadas en un estado anterior.
- Modo local vacío y demostración separada.
- Sin migraciones SQL, secretos administrativos ni servicios contratados.

## Reglas funcionales

- Cliente activo/inactivo es independiente del mantenimiento al día/próximo/vencido.
- Vence al alcanzar fecha o kilometraje, lo que ocurra primero. Se avisa hasta 30 días o 1.000 km antes.
- En modo local se usa la fecha actual de Argentina; la demo conserva 21 de octubre de 2026 como referencia.
- El kilometraje representa el último dato registrado; no una medición en vivo.
- Actualmente hay una recomendación por vehículo; registrar un servicio reemplaza esa recomendación.
- Los importes actuales se expresan en pesos. Antes de integrar contabilidad o facturación se revisará su representación monetaria.
- No se publican datos locales mediante las rutas de demostración del QR.

## Recuperación pendiente de ampliación

La exportación/restauración JSON abarca registros y datos del taller. El módulo completo sigue pendiente para fotografías, adjuntos, ZIP, integridad de archivos y copias automáticas independientes.

La copia anterior a una restauración permanece en el mismo navegador y puede perderse junto con él. Por eso se requiere una descarga conservada fuera del navegador. No hay promesa de retención automática ni protección contra pérdida del dispositivo.

## Autorización

El usuario autorizó implementar la base local y subir la estructura a GitHub para mejorarla progresivamente. La publicación pública del sitio y nuevas funciones compartidas se tramitan como pasos separados. No se modificarán otros proyectos ni se subirán registros reales al repositorio.
