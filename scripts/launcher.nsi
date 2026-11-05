!include "common.nsh"
!include "extractAppPackage.nsh"

CRCCheck off
WindowIcon Off
AutoCloseWindow True
RequestExecutionLevel user
SilentInstall silent

!ifdef MUI_ICON
  Icon "${MUI_ICON}"
!endif

Var appDir

Function .onInit
  !insertmacro check64BitAndSetRegView
FunctionEnd

Section
  InitPluginsDir
  StrCpy $appDir "$LOCALAPPDATA\${APP_FILENAME}\${VERSION}"

  ClearErrors
  FileOpen $0 "$appDir\.ready" r
  IfErrors extract
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "${APP_64_HASH}" launch

  extract:
  RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
  StrCpy $INSTDIR $appDir
  SetOutPath $INSTDIR
  !insertmacro extractEmbeddedAppPackage
  FileOpen $0 "$appDir\.ready" w
  FileWrite $0 "${APP_64_HASH}"
  FileClose $0

  launch:

  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
  ${StdUtils.GetAllParameters} $R0 0
  SetOutPath $appDir
  Exec '"$appDir\${APP_EXECUTABLE_FILENAME}" $R0'
  SetErrorLevel 0
SectionEnd
