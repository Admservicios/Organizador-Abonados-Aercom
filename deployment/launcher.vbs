Option Explicit
Dim shell, fs, root, request, ready, i, edge
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
Function ServerReady()
  On Error Resume Next
  Dim http
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.SetTimeouts 1000, 1000, 1000, 1000
  http.Open "GET", "http://127.0.0.1:4310/api/config", False
  http.Send
  ServerReady = (Err.Number = 0 And http.Status = 200 And InStr(http.ResponseText, "taller-calamante-pc") > 0)
  Err.Clear
End Function
If Not ServerReady() Then
  shell.CurrentDirectory = root
  shell.Run Chr(34) & root & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & root & "\server\main.mjs" & Chr(34), 0, False
End If
ready = False
For i = 1 To 30
  If ServerReady() Then
    ready = True
    Exit For
  End If
  WScript.Sleep 500
Next
If ready Then
  edge = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
  If fs.FileExists(edge) Then
    shell.Run Chr(34) & edge & Chr(34) & " --app=http://127.0.0.1:4310", 1, False
  Else
    shell.Run "http://127.0.0.1:4310", 1, False
  End If
Else
  MsgBox "No se pudo iniciar Taller Calamante. Verificá que el puerto 4310 esté libre. Tus datos se conservan en la carpeta de datos del usuario.", vbExclamation, "Taller Calamante"
End If
