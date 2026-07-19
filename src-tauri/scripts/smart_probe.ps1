# DeviceLifeline SMART / physical disk probe.
# Expects $env:DL_SMART_OUT to point at a writable JSON path.
$ErrorActionPreference = 'SilentlyContinue'
$__dlOut = $env:DL_SMART_OUT
if ([string]::IsNullOrWhiteSpace($__dlOut)) {
  exit 1
}

Import-Module Storage -ErrorAction SilentlyContinue | Out-Null
$rows = New-Object System.Collections.ArrayList

function Write-Empty {
  '[]' | Set-Content -LiteralPath $__dlOut -Encoding utf8
}

function Write-Rows {
  param($list)
  if ($null -eq $list -or $list.Count -eq 0) {
    Write-Empty
    return
  }
  ($list | ConvertTo-Json -Compress -Depth 8) | Set-Content -LiteralPath $__dlOut -Encoding utf8
}

try {
  $disks = @()
  try {
    $disks = @(Get-PhysicalDisk -ErrorAction Stop)
  } catch {
    try {
      $disks = @(Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_PhysicalDisk -ErrorAction Stop)
    } catch {
      try {
        $disks = @(Get-CimInstance Win32_DiskDrive -ErrorAction Stop)
      } catch {
        $disks = @()
      }
    }
  }

  foreach ($d in $disks) {
    $name = $null
    $media = $null
    $health = $null
    $serial = $null
    $size = $null
    $deviceId = $null
    $temp = $null
    $powerOn = $null
    $wear = $null
    $attrs = @()

    if ($d.PSObject.Properties['FriendlyName'] -and $d.FriendlyName) {
      $name = [string]$d.FriendlyName
    } elseif ($d.PSObject.Properties['Model'] -and $d.Model) {
      $name = [string]$d.Model
    } elseif ($d.PSObject.Properties['Caption'] -and $d.Caption) {
      $name = [string]$d.Caption
    } elseif ($d.PSObject.Properties['DeviceId']) {
      $name = 'Disk ' + [string]$d.DeviceId
    }
    if ([string]::IsNullOrWhiteSpace($name)) { continue }

    if ($d.PSObject.Properties['MediaType'] -and $null -ne $d.MediaType) {
      $mt = $d.MediaType
      if (($mt -is [int]) -or ("$mt" -match '^\d+$')) {
        switch ([int]$mt) {
          3 { $media = 'HDD' }
          4 { $media = 'SSD' }
          5 { $media = 'SCM' }
          default { $media = [string]$mt }
        }
      } else {
        $media = [string]$mt
      }
    }

    if ($d.PSObject.Properties['HealthStatus'] -and $null -ne $d.HealthStatus) {
      $hs = $d.HealthStatus
      if (($hs -is [int]) -or ("$hs" -match '^\d+$')) {
        switch ([int]$hs) {
          0 { $health = 'Healthy' }
          1 { $health = 'Warning' }
          2 { $health = 'Unhealthy' }
          default { $health = [string]$hs }
        }
      } else {
        $health = [string]$hs
      }
    }

    if ($d.PSObject.Properties['SerialNumber'] -and $d.SerialNumber) {
      $serial = ([string]$d.SerialNumber).Trim()
    }
    if ($d.PSObject.Properties['Size'] -and $null -ne $d.Size) {
      try { $size = [int64]$d.Size } catch {}
    }
    if ($d.PSObject.Properties['DeviceId'] -and $null -ne $d.DeviceId -and "$($d.DeviceId)" -match '^\d+$') {
      try { $deviceId = [int]$d.DeviceId } catch {}
    }

    # Reliability counters often require elevation; ignore access errors.
    $rel = $null
    try {
      $rel = Get-StorageReliabilityCounter -PhysicalDisk $d -ErrorAction Stop
    } catch {
      try {
        $rel = $d | Get-StorageReliabilityCounter -ErrorAction Stop
      } catch {
        $rel = $null
      }
    }
    if ($null -ne $rel) {
      if ($null -ne $rel.Temperature) { try { $temp = [double]$rel.Temperature } catch {} }
      if ($null -ne $rel.PowerOnHours) { try { $powerOn = [int64]$rel.PowerOnHours } catch {} }
      if ($null -ne $rel.Wear) { try { $wear = [double]$rel.Wear } catch {} }
      foreach ($p in $rel.PSObject.Properties) {
        if ($null -eq $p.Value) { continue }
        $n = [string]$p.Name
        if ($n -match '^(PSComputerName|CimClass|CimInstanceProperties|CimSystemProperties|ObjectId|PassThrough)') {
          continue
        }
        $attrs += [pscustomobject]@{
          id        = $null
          name      = $n
          value     = [string]$p.Value
          raw       = [string]$p.Value
          worst     = $null
          threshold = $null
          status    = 'OK'
        }
      }
    }

    [void]$rows.Add([pscustomobject]@{
        name         = $name
        media        = $media
        health       = $health
        serial       = $serial
        size         = $size
        deviceId     = $deviceId
        temp         = $temp
        powerOnHours = $powerOn
        wear         = $wear
        attrs        = $attrs
      })
  }

  Write-Rows $rows
} catch {
  Write-Empty
}
