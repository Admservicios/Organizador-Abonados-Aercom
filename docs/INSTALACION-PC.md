# Taller Calamante en la PC del taller

La modalidad PC incorpora un servidor privado y SQLite. La interfaz conserva Clientes, Vehículos, Mantenimientos, documentación, PDF y Backups. Todos los dispositivos autorizados trabajan sobre la base de la PC. La modalidad de GitHub Pages sigue funcionando con su base en cada navegador; publicar código no traslada registros personales.

## Paquete Windows

El workflow **Preparar aplicación Windows** genera dos archivos dentro del artefacto **Taller-Calamante-Windows**:

- `Taller-Calamante-Instalar-Windows.exe`: instalador para Windows de 64 bits, con acceso directo e inicio al ingresar a Windows como opción desmarcada inicialmente.
- `Taller-Calamante-Portable-win32-x64.zip`: carpeta completa, con el runtime de Node incluido. Se descomprime y se abre `Taller Calamante.vbs`.

No se necesita instalar Node, npm ni herramientas de desarrollo en el taller. Se abre una ventana de aplicación de Edge cuando está disponible; en otros equipos se usa el navegador predeterminado. El servidor permanece funcionando al cerrar la ventana, para atender otros dispositivos y crear copias. No deben ejecutarse dos versiones al mismo tiempo. La validación automática comprueba el servidor empaquetado, instala, guarda un registro de prueba, desinstala y reinstala verificando que conserve sus datos; la instalación interactiva, el firewall y el inicio de sesión de Windows se deben verificar después en la PC real.

## Datos fuera del programa

- Programa instalado: `%LOCALAPPDATA%\Programs\TallerCalamante`.
- Base, credenciales y archivos: `%LOCALAPPDATA%\TallerCalamante\taller.sqlite` y sus archivos auxiliares SQLite.
- Copias completas verificadas: `%LOCALAPPDATA%\TallerCalamante\backups`.

Los adjuntos originales se guardan como BLOB en SQLite. Cada guardado confirma registros y archivos en una sola transacción. Se mantiene una historia de las últimas revisiones dentro de SQLite y una copia previa descargable desde Backups. Las copias ZIP independientes se crean al haber cambios, cada 15 minutos, aunque el navegador esté cerrado; requieren la PC y el servidor encendidos. La primera se solicita tras el primer guardado. Un fallo se muestra en Backups y permite reintentar. No se borran ZIP anteriores automáticamente.

La desinstalación administra la carpeta del programa, no la carpeta de datos. Para trasladar registros usá preferentemente el ZIP completo. Para copiar directamente SQLite se debe detener antes el servidor y conservar también sus archivos auxiliares; no se debe copiar solo `taller.sqlite` mientras esté funcionando. Guardá copias en otro dispositivo.

## Primer inicio y migración

1. Abrir la aplicación en la PC: `http://127.0.0.1:4310`.
2. Crear la contraseña del taller, de entre 12 y 128 caracteres. La configuración inicial solo se admite desde la PC.
3. En la versión anterior, desde el navegador que contiene los registros, descargar **Backups → Descargar ZIP completo**.
4. En la aplicación instalada, entrar a Backups, seleccionar ese ZIP, revisar los conteos y confirmar la restauración. Reemplaza la base de la PC, con una copia previa. Los JSON sirven para registros, pero no trasladan los archivos adjuntos.
5. Comprobar clientes, vehículos, historial, fotografías y documentos antes de empezar a trabajar en la nueva modalidad. La base original del navegador se conserva; la migración es explícita.

Las sesiones privadas duran 8 horas y pueden cerrarse desde la aplicación. En esta entrega hay una contraseña compartida para el personal autorizado; los usuarios individuales y permisos por rol quedan para una etapa posterior. La demostración mantiene datos ficticios separados y no escribe en la base real.

## Celulares dentro del taller

En la PC, abrir **Backups → PC del taller y celulares → Habilitar acceso desde celulares**. Desde un dispositivo conectado a la misma red privada, abrir una de las direcciones mostradas e ingresar la contraseña del taller. Windows puede requerir permitir el runtime en la red privada. No se cambia el firewall automáticamente.

La PC puede trabajar sin internet, pero los celulares deben conservar conexión con ella. Si cambia la dirección de la PC, usar la nueva dirección indicada en Backups. Los cambios de otra pantalla se actualizan al consultar listados; una edición que partió de una revisión anterior se rechaza y pide actualizar. Si se pierde la conexión durante un guardado, hay que reconectar y revisar el historial antes de repetir la carga. No se guarda silenciosamente una base alternativa en el celular.

El acceso por internet con HTTPS, los enlaces revocables de clientes y el historial público real por QR siguen pendientes. La modalidad PC no publica datos reales en las rutas de demostración. No hay que abrir el puerto del servidor directamente a internet.

## Desarrollo y pruebas

```sh
npm ci
npm run build
npm run build:server
npm test
npm run test:server
npm run start:server
```

El servidor usa el puerto 4310. Para pruebas se admiten `TALLER_PORT`, `TALLER_DATA_DIR` y `TALLER_WEB_DIR`. La raíz compilada `dist` se usa en desarrollo; el paquete incluye `web`, `server` y `runtime`. `npm run package:pc` genera un paquete para el sistema donde se ejecuta; el instalador Windows se construye únicamente en el workflow Windows. Los directorios de datos, bases SQLite y paquetes generados están excluidos de Git.

Las pruebas del servidor cubren sesiones, protección de origen y host, relaciones, concurrencia, archivos, ZIP y persistencia tras reiniciar. El recorrido de navegador también prueba un origen HTTP sin WebCrypto nativo, para celulares en la red privada. El transporte de esa prueba usa un puente HTTP hacia loopback porque el proxy del entorno de pruebas bloquea direcciones privadas; el servidor y sus verificaciones de archivos siguen siendo reales. Otra prueba verifica conexiones TCP con dirección de origen privada y la habilitación de la red.
