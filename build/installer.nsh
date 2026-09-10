!macro customInstall
  DetailPrint "Configuring DreamaniaCode WApp Manager Pro icon cache..."
  CopyFiles /SILENT "$INSTDIR\uninstallerIcon.ico" "$INSTDIR\app.ico"
  
  ; Remove any legacy/duplicate shortcuts so only the standard electron-builder shortcut exists
  SetShellVarContext current
  Delete "$DESKTOP\WA Manager Pro.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\WA Manager Pro.lnk"

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\WA Manager Pro.lnk"
  Delete "$DESKTOP\WApp Manager Pro.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\WA Manager Pro.lnk"
  Delete "$DESKTOP\WApp Manager Pro.lnk"

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
