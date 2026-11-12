; Customizações NSIS — DG Editor (wizard + atalho desktop com ícone do exe)
!ifndef BUILD_UNINSTALLER
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao DG Editor"
  !define MUI_WELCOMEPAGE_TEXT "Instale o editor de sistemas com IA local.$\r$\n$\r$\nPasta padrao: $PROGRAMFILES64\DG Editor$\r$\nNa proxima tela voce pode escolher outra pasta.$\r$\n$\r$\nMarque o atalho na Area de Trabalho para o icone canonico."
  !define MUI_FINISHPAGE_TITLE "DG Editor instalado"
  !define MUI_FINISHPAGE_TEXT "Instalacao concluida. Use o atalho da Area de Trabalho ou o menu Iniciar."
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir DG Editor agora"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Escolha a pasta de instalacao. O padrao e C:\Program Files\DG Editor."
!endif

!macro customInstall
  ; Força atalho Desktop → exe instalado (icone embutido no executavel = canonico)
  SetShellVarContext current
  CreateShortCut "$DESKTOP\DG Editor.lnk" "$INSTDIR\DG Editor.exe" "" "$INSTDIR\DG Editor.exe" 0 SW_SHOWNORMAL
  SetShellVarContext all
  CreateShortCut "$DESKTOP\DG Editor.lnk" "$INSTDIR\DG Editor.exe" "" "$INSTDIR\DG Editor.exe" 0 SW_SHOWNORMAL
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\DG Editor.lnk"
  SetShellVarContext all
  Delete "$DESKTOP\DG Editor.lnk"
!macroend
