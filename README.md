# Taller Calamante

La aplicación se llama **Taller Calamante** desde la versión 0.2.1. Se conservan las claves internas `motortrack-*` y los formatos de respaldo originales para mantener compatibilidad con los datos existentes.

Gestión de clientes, vehículos y mantenimiento para talleres y lubricentros. Interfaz basada en los bocetos acordados: azul, menú lateral grafito, tarjetas claras y adaptación móvil.

## Versión 0.2: base local

Los datos se guardan en **el navegador del usuario**, usando `localStorage`, como el CRM de Aercom. No requiere Supabase, cuentas externas ni un servidor de base de datos.

**GitHub guarda el código. Los datos de tus clientes no se suben a GitHub.** Cada perfil de navegador tiene una base independiente. No existe sincronización entre dispositivos ni inicio de sesión.

Disponible:

- Clientes: crear, editar, buscar y desactivar.
- Vehículos: registrar, editar y consultar su ficha e historial.
- Mantenimientos: registrar trabajos e insumos, importe y próximo servicio.
- Comprobantes PDF: guardar y descargar al registrar un servicio, o descargar desde el historial del vehículo y el listado de mantenimientos. Incluyen importe con centavos y excluyen notas privadas del cliente y del servicio.
- Dashboard, gráficos y vencimientos calculados sobre los registros locales.
- Datos del taller persistentes.
- Respaldo JSON versionado, validación de relaciones y restauración confirmada.
- Copia previa antes de restaurar cuando ya existe una base.
- Exportación de clientes a CSV.
- Modo claro/oscuro y navegación móvil.

La base comienza **vacía**. El botón **Explorar demo** abre datos ficticios separados, mantenidos en memoria. **Volver a mis datos** recupera la base local. Los QR y el historial público actuales son ejemplos ficticios; nunca publican los datos locales.

## Ejecutar el proyecto

Requisitos: Node.js 24.19.0 (`.nvmrc`) y npm.

```sh
cd /workspace/Organizador-Abonados-Aercom
npm ci --cache /workspace/.cache/npm
npm run dev -- --port 5173 --strictPort
```

En tu computadora, ejecutar desde la carpeta del proyecto; omitir la opción de caché de `/workspace` o indicar otra ruta escribible. No se necesitan variables de entorno ni credenciales para esta versión.

```sh
npm run build
npm test
npm run test:e2e
npm run test:publication
npm run format:check
```

Playwright usa Chromium del sistema si existe. Para indicar otra ruta, usar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Si no hay navegador instalado: `npx playwright install chromium`.

## Guardar y recuperar información

1. Usar el **modo local** para tus registros.
2. En **Backups**, descargar **Respaldo local · JSON** después de cambios importantes.
3. Conservar una copia fuera del navegador, por ejemplo en una unidad externa.
4. Para recuperar o trasladar la información, abrir Taller Calamante en el navegador de destino y seleccionar el JSON en **Restaurar un respaldo**.
5. Revisar los conteos y confirmar el reemplazo. No se combinan bases.

La restauración rechaza archivos incompatibles, referencias inválidas, identificadores o patentes duplicados. Antes de reemplazar una base existente, conserva una copia local previa; si esa copia o el guardado fallan, no reemplaza los datos originales. Las copias internas válidas también pueden restaurarse desde esa pantalla.

El CSV solo exporta clientes; no sirve para restaurar todo el sistema. Los respaldos de la demo están marcados como ficticios y no se aceptan como respaldos locales.

### Base de práctica importable

En **Backups → Datos de práctica → Descargar datos de práctica** se obtiene un JSON compatible con la restauración local: **12 clientes, 16 vehículos y 48 mantenimientos ficticios**. Incluye alineación y balanceo, frenos, aceite, filtros y neumáticos. Los vencimientos de ejemplo toman como referencia el 22 de octubre de 2026.

Para cargarlo, volver al modo local si se está explorando la demo, seleccionar el archivo en **Restaurar un respaldo**, revisar los conteos y confirmar. **Reemplaza la base actual; no combina registros.** Descargar primero un respaldo propio si ya existen datos. La descarga del ejemplo no modifica la base. El archivo editable está en [src/data/taller-calamante-practica.json](src/data/taller-calamante-practica.json); solo contiene información inventada.

**Borrar los datos del sitio, usar navegación privada o cambiar de navegador/dirección web puede impedir recuperar los registros sin un respaldo.** Trabajar desde una dirección estable y descargar una copia antes de cambiar de servidor o alojamiento. `localStorage` tiene una capacidad limitada y no sustituye un sistema de base de datos con respaldo independiente.

Ver [datos locales y recuperación](docs/DATOS-LOCALES.md).

## Comprobantes de mantenimiento

En el formulario, **Guardar y generar PDF** primero conserva el servicio y luego descarga el comprobante. En **Mantenimientos** y en el historial de cada vehículo, el botón **PDF** permite descargarlo nuevamente sin duplicar registros. Si falla el guardado no se genera el comprobante; si falla la generación, el servicio guardado sigue disponible para reintentar desde el historial.

El PDF se genera en el navegador, sin subir datos ni abrir servicios externos. Incluye taller, cliente, vehículo, fecha y kilometraje del servicio, tareas, insumos e importe en ARS. Las notas privadas se omiten; los ejemplos de la demo se identifican como ficticios. La recomendación del próximo servicio es la **vigente al generar el comprobante**, porque los registros anteriores no almacenan una copia histórica de esa recomendación. Los PDFs descargados no se guardan como adjuntos en la base ni en el respaldo JSON.

## Distribución web y GitHub

El código se prepara para un alojamiento estático: `npm run build` genera `dist`. La compilación usa rutas con `#` y recursos relativos para funcionar también dentro de una carpeta de GitHub Pages. Por ejemplo, la sección Clientes se abre con `#/clientes`.

**El HTML editable está en `app.html`.** `index.html` y `site-assets/` son salidas compiladas versionadas para que también funcione Pages cuando está configurado para servir la raíz de `main`. No editar esos archivos generados a mano.

Antes de subir cambios de interfaz, ejecutar `npm run publish:static`: compila la aplicación, prepara `dist` y actualiza la copia estática de la raíz. Después ejecutar `npm run test:publication`, que abre ambas variantes en un navegador con un servidor estático sin Vite y comprueba rutas, recursos y persistencia. El comando se puede repetir; conserva recursos con hash anteriores para no romper pestañas que tienen HTML en caché.

Para comprobar la compilación: `npm run preview -- --port 5173 --strictPort`. El desarrollo usa rutas normales; la distribución usa rutas con `#` para evitar errores al recargar en servidores estáticos.

El workflow **Verificar y publicar Taller Calamante** ejecuta compilación, pruebas y formato en GitHub Actions. También genera el artefacto descargable `taller-calamante-web`. Después de una verificación exitosa en `main`, publica **solo `dist`** en GitHub Pages mediante las acciones oficiales de Pages. Las solicitudes de cambios ejecutan verificaciones sin publicar.

La dirección del sitio es `https://admservicios.github.io/Taller-Calamante/`. Se recomienda **GitHub Actions** como origen de publicación. La raíz de `main` también contiene ahora una compilación lista para servir, con `.nojekyll`, de modo que una publicación desde la rama no vuelva a sustituir el sitio por código TypeScript sin compilar. El paso de publicación intenta actualizar la configuración con el token automático del workflow; si GitHub lo impide, el sitio seguirá funcionando desde la raíz de `main`. Para unificar los despliegues, el propietario puede elegir **Settings → Pages → Build and deployment → Source → GitHub Actions**.

El despliegue mantiene el origen web y conserva el almacenamiento local de los usuarios. No borra datos del navegador ni sube respaldos al repositorio. Los errores y estados del despliegue se consultan en la pestaña Actions.

El repositorio ahora se llama **Admservicios/Taller-Calamante**. La dirección actual conserva las mayúsculas del repositorio: `https://admservicios.github.io/Taller-Calamante/`. El checkout local puede conservar su carpeta original; su remoto debe apuntar a `https://github.com/Admservicios/Taller-Calamante.git`. El cambio de camino mantiene el mismo origen del navegador y, por lo tanto, las claves de almacenamiento locales existentes.

## Límites actuales

- Sin autenticación, roles efectivos ni aislamiento entre personas que usan el mismo perfil del navegador. El panel de roles es una propuesta visual futura.
- Sin sincronización ni historial público de datos reales. El QR de demostración no es un mecanismo de acceso seguro o revocable.
- Fotografías: solo previsualización; no se guardan al registrar un servicio.
- Pendientes: documentos permanentes, ZIP con adjuntos y respaldos automáticos independientes.
- Una recomendación pendiente por vehículo en esta base inicial; se ampliará a varias categorías.
- PWA y edición sin conexión a la aplicación todavía no implementadas.
- Para editar, usar una pestaña a la vez. Se detectan revisiones desactualizadas al escribir y se reciben avisos de cambios de otras pestañas; no hay edición colaborativa.

Las ilustraciones de vehículos son provisionales y no descargan imágenes externas. Los ejemplos usan información ficticia.

## Estructura

```text
src/app/                Navegación y estado local/demo
src/components/         Componentes visuales compartidos
src/features/           Pantallas por módulo
src/lib/localDatabase.ts Esquemas, persistencia y respaldos versionados
src/lib/demo.ts          Ejemplos y utilidades de presentación
src/styles.css          Diseño y adaptación móvil
tests/unit/             Reglas de negocio y recuperación
tests/e2e/              Recorridos de navegador y persistencia
.github/workflows/      Verificaciones en GitHub
app.html                Entrada HTML editable de Vite
index.html              HTML compilado para Pages desde main
site-assets/            Recursos compilados con hash
scripts/                Preparación y prueba de publicación estática
docs/                   Plan y decisiones de arquitectura
```

Ver [plan actualizado](docs/PLAN.md). No se deben agregar respaldos, bases de datos reales ni secretos al repositorio.
