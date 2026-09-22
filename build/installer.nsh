; Adds "Open with cairn" to the Windows Explorer context menu for both files
; and folders, so a project can be opened without launching the app first.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\cairn" "" "Open with cairn"
  WriteRegStr HKCU "Software\Classes\*\shell\cairn" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\*\shell\cairn\command" "" '"$appExe" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\cairn" "" "Open folder with cairn"
  WriteRegStr HKCU "Software\Classes\Directory\shell\cairn" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\cairn\command" "" '"$appExe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\cairn" "" "Open folder with cairn"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\cairn" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\cairn\command" "" '"$appExe" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\cairn"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\cairn"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\cairn"
!macroend
