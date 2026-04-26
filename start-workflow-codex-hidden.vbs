' Launches start-workflow-codex.cmd with a hidden window.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = scriptDir & "\start-workflow-codex.cmd"
shell.Run Chr(34) & cmdPath & Chr(34), 0, False
