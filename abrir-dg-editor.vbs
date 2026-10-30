' Abre o DG Editor sem NENHUMA janela de console (cmd/powershell/vite).
' Atalho da Area de Trabalho: wscript + ESTE arquivo.
Option Explicit
Dim sh, raiz, ps1, cmd, fso
raiz = "D:\CURSOR\DG Editor"
ps1 = raiz & "\scripts\splash-boot.ps1"
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(ps1) Then
  WScript.Quit 1
End If
On Error Resume Next
fso.CreateTextFile(raiz & "\.dg-root", True).Write raiz
On Error GoTo 0
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
