#define AppVersion "0.3.0"
[Setup]
AppId={{94D7A4C3-3EE9-4E51-BC86-DCAC236C2567}
AppName=Taller Calamante
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\TallerCalamante
DefaultGroupName=Taller Calamante
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\release
OutputBaseFilename=Taller-Calamante-Instalar-Windows
Compression=lzma2
SolidCompression=yes
SetupIconFile=..\release\pc\taller.ico
UninstallDisplayIcon={app}\taller.ico
CloseApplications=yes
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Tasks]
Name: "startup"; Description: "Iniciar Taller Calamante al ingresar a Windows"; Flags: unchecked
[Files]
Source: "..\release\pc\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\Taller Calamante"; Filename: "{app}\Taller Calamante.vbs"; IconFilename: "{app}\taller.ico"
Name: "{group}\Taller Calamante"; Filename: "{app}\Taller Calamante.vbs"; IconFilename: "{app}\taller.ico"
Name: "{userstartup}\Taller Calamante"; Filename: "{app}\Taller Calamante.vbs"; IconFilename: "{app}\taller.ico"; Tasks: startup
[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\Taller Calamante.vbs"""; Description: "Abrir Taller Calamante"; Flags: postinstall nowait skipifsilent
; No se elimina {localappdata}\TallerCalamante: allí está la base y los respaldos.
