; Adds "Open with causeway" to the Windows Explorer context menu for both files
; and folders, so a project can be opened without launching the app first.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\causeway" "" "Open with causeway"
  WriteRegStr HKCU "Software\Classes\*\shell\causeway" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\*\shell\causeway\command" "" '"$appExe" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\causeway" "" "Open folder with causeway"
  WriteRegStr HKCU "Software\Classes\Directory\shell\causeway" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\causeway\command" "" '"$appExe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\causeway" "" "Open folder with causeway"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\causeway" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\causeway\command" "" '"$appExe" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\causeway"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\causeway"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\causeway"
!macroend
