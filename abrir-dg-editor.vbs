' Abre o DG Editor sem nenhuma janela de console (cmd/powershell).
' Atalho da Area de Trabalho deve apontar para ESTE arquivo.
Option Explicit
Dim sh, raiz, ps1, cmd
raiz = "D:\CURSOR\DG Editor"
ps1 = raiz & "\scripts\splash-boot.ps1"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
' 0 = janela oculta; False = nao espera
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
