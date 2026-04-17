' Launches start-workflow.cmd with a hidden window.
' Shortcut target should point here so the terminal does not stay visible.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = scriptDir & "\start-workflow.cmd"
shell.Run Chr(34) & cmdPath & Chr(34), 0, False
