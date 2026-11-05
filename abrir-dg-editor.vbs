' Abre o DG Editor sem NENHUMA janela de console (cmd/powershell/vite).
' Atalho: wscript + ESTE arquivo.
Option Explicit
Dim sh, raiz, splash, boot, cmd, fso
raiz = "D:\CURSOR\DG Editor"
splash = raiz & "\scripts\splash-boot.ps1"
boot = raiz & "\dg-boot.ps1"
Set fso = CreateObject("Scripting.FileSystemObject")
On Error Resume Next
fso.CreateTextFile(raiz & "\.dg-root", True).Write raiz
On Error GoTo 0
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
If fso.FileExists(splash) Then
  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & splash & """"
ElseIf fso.FileExists(boot) Then
  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & boot & """ -Silent"
Else
  WScript.Quit 1
End If
sh.Run cmd, 0, False
