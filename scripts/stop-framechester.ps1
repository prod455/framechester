[CmdletBinding(SupportsShouldProcess=$true)]
param([string]$Workspace = '', [string]$ProtectPath, [switch]$Directory, [string]$InventoryFile)
$ErrorActionPreference = 'Stop'
if ($ProtectPath) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($Directory) {
    $acl = [IO.Directory]::GetAccessControl($ProtectPath,[Security.AccessControl.AccessControlSections]::Access)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
  } else {
    $acl = [IO.File]::GetAccessControl($ProtectPath,[Security.AccessControl.AccessControlSections]::Access)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow)
  }
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($existingRule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) { $acl.RemoveAccessRuleSpecific($existingRule) }
  $acl.AddAccessRule($rule)
  if ($PSCmdlet.ShouldProcess($ProtectPath,'Restringir acesso ao usuário atual')) {
    if ($Directory) { [IO.Directory]::SetAccessControl($ProtectPath,$acl) }
    else { [IO.File]::SetAccessControl($ProtectPath,$acl) }
  }
  return
}
if (-not $Workspace) { $Workspace = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$resolvedWorkspace = (Resolve-Path -LiteralPath $Workspace).Path
$selector = Join-Path $resolvedWorkspace 'scripts/infra.mjs'
if (-not (Test-Path -LiteralPath $selector -PathType Leaf)) { throw 'Diretório do Framechester inválido.' }
if ($InventoryFile) {
  if ((Get-Item -LiteralPath $InventoryFile).Length -gt 8000000) { throw 'Inventário de teste excessivo.' }
  $inventory = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $InventoryFile -Raw)
} else { $inventory = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CreationDate } | ForEach-Object {
  [pscustomobject]@{ id=[int]$_.ProcessId; parentId=[int]$_.ParentProcessId; name=$_.Name; commandLine=$_.CommandLine; startTime=$_.CreationDate.ToUniversalTime().ToString('o') }
}) }
$payload = @{ root=$resolvedWorkspace; processes=$inventory; ownPid=$PID } | ConvertTo-Json -Depth 4 -Compress
$idsJson = $payload | & node $selector --select-processes
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível identificar os processos do Framechester.' }
$selectedIds = ConvertFrom-Json -InputObject ($idsJson -join [Environment]::NewLine)
if ($InventoryFile) { ConvertTo-Json -InputObject @($selectedIds) -Compress; return }
$stopped = 0
foreach ($selectedId in $selectedIds) {
  $snapshot = $inventory | Where-Object { $_.id -eq $selectedId } | Select-Object -First 1
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$selectedId)" -ErrorAction SilentlyContinue
  if (-not $snapshot -or -not $current) { continue }
  if ($current.CommandLine -cne $snapshot.commandLine -or $current.CreationDate.ToUniversalTime().ToString('o') -cne $snapshot.startTime) { continue }
  if ($PSCmdlet.ShouldProcess("PID $selectedId ($($snapshot.name))",'Encerrar processo do Framechester')) {
    try { Stop-Process -Id ([int]$selectedId) -ErrorAction Stop; $stopped++ }
    catch { if (Get-Process -Id ([int]$selectedId) -ErrorAction SilentlyContinue) { throw } }
  }
}
Write-Output "$stopped processo(s) do Framechester encerrado(s)."
