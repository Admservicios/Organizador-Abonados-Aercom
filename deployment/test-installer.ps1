$ErrorActionPreference = 'Stop'
$installer = Join-Path $PWD 'release/Taller-Calamante-Instalar-Windows.exe'
$portable = Join-Path $PWD 'release/Taller-Calamante-Portable-win32-x64.zip'
if (-not (Test-Path $installer) -or -not (Test-Path $portable)) { throw 'Falta el instalador o el paquete portable.' }
$installDir = Join-Path $env:RUNNER_TEMP 'TallerCalamante-install-test'
$dataDir = Join-Path $env:RUNNER_TEMP 'TallerCalamante-data-test'
$env:TALLER_DATA_DIR = $dataDir
$env:TALLER_PORT = '4311'
$url = 'http://127.0.0.1:4311'
function Install-Taller {
  $result = Start-Process $installer -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR=`"$installDir`"" -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw 'El instalador no terminó correctamente.' }
  if (-not (Test-Path (Join-Path $installDir 'runtime/node.exe'))) { throw 'Falta el runtime instalado.' }
}
function Start-Taller {
  $script:server = Start-Process (Join-Path $installDir 'runtime/node.exe') -ArgumentList "`"$(Join-Path $installDir 'server/main.mjs')`"" -PassThru
  for ($i = 0; $i -lt 30; $i++) {
    if ($script:server.HasExited) { throw 'El servidor instalado terminó antes de iniciar.' }
    try {
      $config = Invoke-RestMethod "$url/api/config"
      if ($config.application -eq 'taller-calamante-pc') { return }
    } catch { Start-Sleep -Seconds 1 }
  }
  throw 'El servidor instalado no respondió.'
}
function Stop-Taller {
  if ($script:server -and -not $script:server.HasExited) {
    Stop-Process -Id $script:server.Id -Force
    $script:server.WaitForExit()
  }
}
try {
  Write-Output 'Instalando e iniciando la aplicación.'
  Install-Taller
  Start-Taller
  $headers = @{ Origin = $url }
  Invoke-RestMethod "$url/api/setup" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"password":"Prueba-instalador-2026"}' -SessionVariable session | Out-Null
  $state = Invoke-RestMethod "$url/api/state" -WebSession $session
  $state.data.customers = @(@{id='cliente-prueba-windows'; name='Cliente conservado al reinstalar'; document=''; phone=''; email=''; address=''; active=$true; notes=''})
  $body = @{data=$state.data; uploads=@(); restore=$false} | ConvertTo-Json -Depth 30 -Compress
  Invoke-RestMethod "$url/api/state" -Method Put -SkipHeaderValidation -Headers @{Origin=$url; 'If-Match'=[string]$state.revision} -WebSession $session -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  # Invoke-RestMethod conserva los encabezados adicionales en WebSession.
  $session.Headers.Remove('If-Match') | Out-Null
  Write-Output 'Registro confirmado en SQLite; probando desinstalación.'
  Stop-Taller
  $uninstaller = Join-Path $installDir 'unins000.exe'
  $result = Start-Process $uninstaller -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw 'La desinstalación de prueba falló.' }
  if (-not (Test-Path (Join-Path $dataDir 'taller.sqlite'))) { throw 'La desinstalación eliminó la carpeta de datos.' }
  Write-Output 'Datos conservados; reinstalando.'
  Install-Taller
  Start-Taller
  $recovered = Invoke-RestMethod "$url/api/state" -WebSession $session
  if ($recovered.data.customers[0].name -ne 'Cliente conservado al reinstalar') { throw 'Los datos no se conservaron al reinstalar.' }
  Write-Output 'Windows: instalación, acceso privado, guardado SQLite, desinstalación y reinstalación con datos conservados correctos.'
} catch {
  Write-Output ('::error::' + $_.Exception.Message.Replace("`r", '').Replace("`n", ' ') + ' Línea: ' + $_.InvocationInfo.ScriptLineNumber)
  throw
} finally {
  Stop-Taller
}
