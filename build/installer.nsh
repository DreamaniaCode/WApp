!macro customInstall
  DetailPrint "Configuring DreamaniaCode WA Manager Pro shortcuts and icon cache..."
  CopyFiles /SILENT "$INSTDIR\uninstallerIcon.ico" "$INSTDIR\app.ico"
  
  SetShellVarContext current
  Delete "$DESKTOP\WA Manager Pro.lnk"
  CreateShortCut "$DESKTOP\WA Manager Pro.lnk" "$appExe" "" "$INSTDIR\app.ico" 0 "" "" "${APP_DESCRIPTION}"

  SetShellVarContext all
  Delete "$DESKTOP\WA Manager Pro.lnk"
  CreateShortCut "$DESKTOP\WA Manager Pro.lnk" "$appExe" "" "$INSTDIR\app.ico" 0 "" "" "${APP_DESCRIPTION}"

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\WA Manager Pro.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\WA Manager Pro.lnk"

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
