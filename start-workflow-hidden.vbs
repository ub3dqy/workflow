' Launches a workflow cmd target with a hidden window.
' Shortcut target should point here so the terminal does not stay visible.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function

If WScript.Arguments.Count > 0 Then
  cmdPath = WScript.Arguments(0)
  argStart = 1
Else
  cmdPath = scriptDir & "\start-workflow.cmd"
  argStart = 0
End If

command = Quote(cmdPath)

If argStart = 0 Then
  command = command & " --hidden-relay"
End If

For i = argStart To WScript.Arguments.Count - 1
  command = command & " " & Quote(WScript.Arguments(i))
Next

shell.Run command, 0, False
