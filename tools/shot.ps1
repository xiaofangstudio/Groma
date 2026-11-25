param(
  [string]$Exe = "D:\20533\deskbox\fangwork\Groma\src-tauri\target\release\groma.exe",
  [string]$Out = "D:\20533\deskbox\fangwork\Groma\shots\editor.png",
  [string[]]$AppArgs = @("--new"),
  [string]$Open = "",
  [switch]$Welcome,
  [string]$Click = "",
  [string]$Click2 = "",
  [string]$Click3 = "",
  [string]$Click4 = "",
  [string]$ShiftClick = "",
  [string]$Drag = "",
  [switch]$HoldDrag,
  [string]$Key = "",
  [string]$Text = "",
  [switch]$Enter,
  [string]$Actions = "",
  [int]$WaitMs = 3200,
  [int]$PostWaitMs = 900,
  [int]$WinWidth = 0,
  [int]$WinHeight = 0,
  [switch]$Maximized,
  [string]$CdpScript = "",
  [int]$CdpPort = 0,
  [string]$CaptureProcess = "",
  [string]$CaptureOut = "",
  [switch]$NoDesktop
)

$ErrorActionPreference = "Stop"
if ($Welcome) { $AppArgs = @() }
elseif ($Open) { $AppArgs = @("--open", $Open) }
$outDir = Split-Path -Parent $Out
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class GromaShot {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread;
    public int dwProcessId, dwThreadId;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int x, y; }

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attrs);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr h, EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int h2, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);

  public static IntPtr FindWindow(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumDesktopWindows(IntPtr.Zero, delegate(IntPtr h, IntPtr lp) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        if (sb.ToString().Contains("Groma")) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindDesktopWindow(IntPtr desktop, uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumDesktopWindows(desktop, delegate(IntPtr h, IntPtr lp) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p == pid) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        if (sb.ToString().Contains("Groma")) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindDesktopProcessWindow(IntPtr desktop, uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumDesktopWindows(desktop, delegate(IntPtr h, IntPtr lp) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        if (sb.Length > 0) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindDescendant(IntPtr parent, string className) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp) {
      StringBuilder sb = new StringBuilder(256);
      GetClassName(h, sb, 256);
      if (sb.ToString() == className) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr RunOnDesktop(string desktopName, string exe, string cmdline, out uint pid) {
    STARTUPINFO si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    si.lpDesktop = desktopName;
    PROCESS_INFORMATION pi;
    bool ok = CreateProcess(exe, cmdline, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, System.IO.Path.GetDirectoryName(exe), ref si, out pi);
    if (!ok) { pid = 0; return IntPtr.Zero; }
    pid = (uint)pi.dwProcessId;
    CloseHandle(pi.hThread);
    return pi.hProcess;
  }
}
"@

# 让 PowerShell 也按物理像素工作，避免 150% DPI 下截图被压缩
try { [GromaShot]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}

function Get-ExeCommandLine {
  param([string[]]$Extra)
  if ($Extra.Count -eq 0) { return "" }
  return ($Extra | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "
}

function Capture-Window {
  param([IntPtr]$Hwnd, [string]$Path)
  if ($Hwnd -eq [IntPtr]::Zero) { return $false }
  [GromaShot+RECT]$r = New-Object GromaShot+RECT
  [GromaShot]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  $w = $r.right - $r.left
  $h = $r.bottom - $r.top
  if ($w -lt 100 -or $h -lt 100) { return $false }
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [GromaShot]::PrintWindow($Hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  [GromaShot+RECT]$cr = New-Object GromaShot+RECT
  [GromaShot]::GetClientRect($Hwnd, [ref]$cr) | Out-Null
  $clientW = $cr.right - $cr.left
  $border = [int](($w - $clientW) / 2)
  if ($border -gt 0 -and $border -lt 40 -and $h -gt $border) {
    $cropW = $w - 2 * $border
    $cropH = $h - $border
    $crop = New-Object System.Drawing.Bitmap $cropW, $cropH
    $cg = [System.Drawing.Graphics]::FromImage($crop)
    $cg.DrawImage($bmp, [System.Drawing.Rectangle]::new(0, 0, $cropW, $cropH), [System.Drawing.Rectangle]::new($border, 0, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)
    $cg.Dispose()
    $bmp.Dispose()
    $crop.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
  } else {
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
  return $ok
}

function LParam([int]$X, [int]$Y) {
  return [IntPtr]::new((($Y -band 0xFFFF) -shl 16) -bor ($X -band 0xFFFF))
}

function Map-Point([IntPtr]$Top, [IntPtr]$Target, [int]$X, [int]$Y) {
  $pt = New-Object GromaShot+POINT
  $pt.x = $X
  $pt.y = $Y
  [GromaShot]::ClientToScreen($Top, [ref]$pt) | Out-Null
  [GromaShot]::ScreenToClient($Target, [ref]$pt) | Out-Null
  return @($pt.x, $pt.y)
}

function Send-Click([IntPtr]$Top, [IntPtr]$Target, [int]$X, [int]$Y) {
  $m = Map-Point $Top $Target $X $Y
  $lp = LParam $m[0] $m[1]
  [GromaShot]::PostMessage($Target, 0x0200, [IntPtr]::Zero, $lp) | Out-Null
  Start-Sleep -Milliseconds 80
  [GromaShot]::PostMessage($Target, 0x0201, [IntPtr]::new(1), $lp) | Out-Null
  Start-Sleep -Milliseconds 70
  [GromaShot]::PostMessage($Target, 0x0202, [IntPtr]::Zero, $lp) | Out-Null
  Start-Sleep -Milliseconds 200
}

function Send-ShiftClick([IntPtr]$Top, [IntPtr]$Target, [int]$X, [int]$Y) {
  $m = Map-Point $Top $Target $X $Y
  $lp = LParam $m[0] $m[1]
  [GromaShot]::PostMessage($Target, 0x0100, [IntPtr]::new(0x10), [IntPtr]::new(0x002A0001)) | Out-Null
  [GromaShot]::PostMessage($Target, 0x0200, [IntPtr]::new(4), $lp) | Out-Null
  Start-Sleep -Milliseconds 80
  [GromaShot]::PostMessage($Target, 0x0201, [IntPtr]::new(5), $lp) | Out-Null
  Start-Sleep -Milliseconds 70
  [GromaShot]::PostMessage($Target, 0x0202, [IntPtr]::Zero, $lp) | Out-Null
  [GromaShot]::PostMessage($Target, 0x0101, [IntPtr]::new(0x10), [IntPtr]::new(0xC02A0001)) | Out-Null
  Start-Sleep -Milliseconds 200
}

function Send-Drag([IntPtr]$Top, [IntPtr]$Target, [int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [bool]$Hold) {
  $ms = Map-Point $Top $Target $X1 $Y1
  $me = Map-Point $Top $Target $X2 $Y2
  $start = LParam $ms[0] $ms[1]
  $end = LParam $me[0] $me[1]
  [GromaShot]::PostMessage($Target, 0x0200, [IntPtr]::Zero, $start) | Out-Null
  Start-Sleep -Milliseconds 80
  [GromaShot]::PostMessage($Target, 0x0201, [IntPtr]::new(1), $start) | Out-Null
  Start-Sleep -Milliseconds 80
  for ($i = 1; $i -le 12; $i++) {
    $x = [int]($ms[0] + ($me[0] - $ms[0]) * $i / 12)
    $y = [int]($ms[1] + ($me[1] - $ms[1]) * $i / 12)
    [GromaShot]::PostMessage($Target, 0x0200, [IntPtr]::new(1), (LParam $x $y)) | Out-Null
    Start-Sleep -Milliseconds 30
  }
  if (-not $Hold) {
    [GromaShot]::PostMessage($Target, 0x0202, [IntPtr]::Zero, $end) | Out-Null
    Start-Sleep -Milliseconds 300
  } else {
    # 保持鼠标按下，让拖动中的吸附参考线留在画面上供截图检查。
    Start-Sleep -Milliseconds 450
  }
}

function Send-Enter([IntPtr]$Target) {
  $down = [IntPtr]::new(0x001C0001)
  $up = [IntPtr]::new(0xC01C0001)
  [GromaShot]::PostMessage($Target, 0x0100, [IntPtr]::new(13), $down) | Out-Null
  Start-Sleep -Milliseconds 60
  [GromaShot]::PostMessage($Target, 0x0101, [IntPtr]::new(13), $up) | Out-Null
  Start-Sleep -Milliseconds 300
}

function Send-Key([IntPtr]$Target, [string]$Text) {
  if ($Text.Length -eq 0) { return }
  $named = @{
    'esc' = 0x1B
    'escape' = 0x1B
    'enter' = 0x0D
    'tab' = 0x09
    'backspace' = 0x08
    'delete' = 0x2E
    'space' = 0x20
  }
  $lower = $Text.ToLowerInvariant()
  if ($named.ContainsKey($lower)) {
    $vk = $named[$lower]
  } else {
    $vk = switch ($Text.Substring(0, 1)) {
      '=' { 0xBB }
      '+' { 0xBB }
      '-' { 0xBD }
      default { [int][char]::ToUpperInvariant($Text[0]) }
    }
  }
  $scan = [IntPtr]::new(($vk -shl 16))
  [GromaShot]::PostMessage($Target, 0x0100, [IntPtr]::new($vk), $scan) | Out-Null
  Start-Sleep -Milliseconds 80
  [GromaShot]::PostMessage($Target, 0x0101, [IntPtr]::new($vk), ([IntPtr]::new(0xC0000001 -bor ($vk -shl 16)))) | Out-Null
  Start-Sleep -Milliseconds 300
}

function Send-Text([IntPtr]$Target, [string]$Value) {
  foreach ($ch in $Value.ToCharArray()) {
    [GromaShot]::PostMessage($Target, 0x0102, [IntPtr]::new([int][char]$ch), [IntPtr]::new(1)) | Out-Null
    Start-Sleep -Milliseconds 40
  }
  Start-Sleep -Milliseconds 250
}

function Send-Chord([IntPtr]$Target, [string]$Text) {
  $map = @{
    'alt' = @(0x12, 0x38, $false)
    'shift' = @(0x10, 0x2A, $false)
    'ctrl' = @(0x11, 0x1D, $false)
    'up' = @(0x26, 0x48, $true)
    'down' = @(0x28, 0x50, $true)
    'left' = @(0x25, 0x4B, $true)
    'right' = @(0x27, 0x4D, $true)
  }
  $keys = @()
  foreach ($name in $Text.Split('+')) {
    $trimmed = $name.Trim()
    $entry = $map[$trimmed.ToLowerInvariant()]
    if (-not $entry -and $trimmed.Length -eq 1) {
      $vk = [int][char]::ToUpperInvariant($trimmed[0])
      $entry = @($vk, 0, $false)
    }
    if ($entry) { $keys += ,$entry }
  }
  if ($keys.Count -eq 0) { return }
  foreach ($key in $keys) {
    $ext = if ($key[2]) { 0x01000000 } else { 0 }
    [GromaShot]::PostMessage($Target, 0x0100, [IntPtr]::new($key[0]), [IntPtr]::new(0x00000001 -bor ($key[1] -shl 16) -bor $ext)) | Out-Null
    Start-Sleep -Milliseconds 50
  }
  for ($i = $keys.Count - 1; $i -ge 0; $i--) {
    $key = $keys[$i]
    $ext = if ($key[2]) { 0x01000000 } else { 0 }
    [GromaShot]::PostMessage($Target, 0x0101, [IntPtr]::new($key[0]), [IntPtr]::new(0xC0000001 -bor ($key[1] -shl 16) -bor $ext)) | Out-Null
    Start-Sleep -Milliseconds 50
  }
  Start-Sleep -Milliseconds 300
}

Get-Process groma -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 200
if ($CdpPort -gt 0) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort --remote-allow-origins=*"
}

$desktop = [IntPtr]::Zero
$proc = $null
$procHandle = [IntPtr]::Zero
$hwnd = [IntPtr]::Zero

try {
  if (-not $NoDesktop) {
    $name = "GromaShot-" + (Get-Random)
    $desktop = [GromaShot]::CreateDesktop($name, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
    if ($desktop -ne [IntPtr]::Zero) {
      $cmd = Get-ExeCommandLine $AppArgs
      $full = if ($cmd) { '"' + $Exe + '" ' + $cmd } else { '"' + $Exe + '"' }
      [uint32]$procId = 0
      $procHandle = [GromaShot]::RunOnDesktop($name, $Exe, $full, [ref]$procId)
      if ($procHandle -ne [IntPtr]::Zero) {
        $deadline = (Get-Date).AddMilliseconds($WaitMs + 2000)
        while ((Get-Date) -lt $deadline -and $hwnd -eq [IntPtr]::Zero) {
          Start-Sleep -Milliseconds 120
          $hwnd = [GromaShot]::FindDesktopWindow($desktop, $procId)
        }
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      }
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) {
    if ($desktop -ne [IntPtr]::Zero) { [GromaShot]::CloseDesktop($desktop) | Out-Null; $desktop = [IntPtr]::Zero }
    $proc = Start-Process -FilePath $Exe -ArgumentList $AppArgs -PassThru
    $deadline = (Get-Date).AddMilliseconds($WaitMs + 2000)
    while ((Get-Date) -lt $deadline -and $hwnd -eq [IntPtr]::Zero) {
      Start-Sleep -Milliseconds 120
      $hwnd = $proc.MainWindowHandle
      if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [GromaShot]::FindWindow([uint32]$proc.Id) }
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) { throw "Groma 窗口没有出现" }

  if ($Maximized) {
    [GromaShot]::ShowWindow($hwnd, 3) | Out-Null
    Start-Sleep -Milliseconds 900
  } elseif ($WinWidth -gt 0 -and $WinHeight -gt 0) {
    # 只改尺寸，不移动窗口；NOMOVE(0x0002) + NOZORDER(0x0004)
    [GromaShot]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, $WinWidth, $WinHeight, 0x0006) | Out-Null
    Start-Sleep -Milliseconds 500
  }

  # 等启动页 + 目标页面稳定；不改变窗口大小，保持配置的逻辑尺寸
  Start-Sleep -Milliseconds $WaitMs
  $inputHwnd = [GromaShot]::FindDescendant($hwnd, "Chrome_RenderWidgetHostHWND")
  if ($inputHwnd -eq [IntPtr]::Zero) { $inputHwnd = [GromaShot]::FindDescendant($hwnd, "Chrome_WidgetWin_0") }
  if ($inputHwnd -eq [IntPtr]::Zero) { $inputHwnd = $hwnd }
  if ($Key) {
    Send-Key $inputHwnd $Key
  }
  if ($Click) {
    $parts = $Click.Split(',')
    if ($parts.Count -eq 2) { Send-Click $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) }
  }
  if ($ShiftClick) {
    $parts = $ShiftClick.Split(',')
    if ($parts.Count -eq 2) { Send-ShiftClick $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) }
  }
  if ($Click2) {
    $parts = $Click2.Split(',')
    if ($parts.Count -eq 2) { Send-Click $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) }
  }
  if ($Click3) {
    $parts = $Click3.Split(',')
    if ($parts.Count -eq 2) { Send-Click $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) }
  }
  if ($Text) {
    Send-Text $inputHwnd $Text
  }
  if ($Click4) {
    $parts = $Click4.Split(',')
    if ($parts.Count -eq 2) { Send-Click $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) }
  }
  if ($Enter) {
    Start-Sleep -Milliseconds 700
    Send-Enter $inputHwnd
  }
  if ($Drag) {
    $parts = $Drag.Split(',')
    if ($parts.Count -eq 4) {
      Send-Drag $hwnd $inputHwnd ([int]$parts[0]) ([int]$parts[1]) ([int]$parts[2]) ([int]$parts[3]) ([bool]$HoldDrag)
      if (-not $HoldDrag) { Start-Sleep -Milliseconds 1000 }
    }
  }
  if ($Actions) {
    foreach ($action in $Actions.Split(';')) {
      $parts = $action.Split(':', 2)
      if ($parts.Count -ne 2) { continue }
      $kind = $parts[0].Trim().ToLowerInvariant()
      $vals = $parts[1].Split(',')
      if ($kind -eq 'click' -and $vals.Count -eq 2) {
        Send-Click $hwnd $inputHwnd ([int]$vals[0]) ([int]$vals[1])
      } elseif ($kind -eq 'drag' -and $vals.Count -eq 4) {
        Send-Drag $hwnd $inputHwnd ([int]$vals[0]) ([int]$vals[1]) ([int]$vals[2]) ([int]$vals[3]) $false
        Start-Sleep -Milliseconds 600
      } elseif ($kind -eq 'holddrag' -and $vals.Count -eq 4) {
        Send-Drag $hwnd $inputHwnd ([int]$vals[0]) ([int]$vals[1]) ([int]$vals[2]) ([int]$vals[3]) $true
      } elseif ($kind -eq 'spacedrag' -and $vals.Count -eq 4) {
        [GromaShot]::PostMessage($inputHwnd, 0x0100, [IntPtr]::new(0x20), [IntPtr]::new(0x00390001)) | Out-Null
        Start-Sleep -Milliseconds 120
        Send-Drag $hwnd $inputHwnd ([int]$vals[0]) ([int]$vals[1]) ([int]$vals[2]) ([int]$vals[3]) $false
        [GromaShot]::PostMessage($inputHwnd, 0x0101, [IntPtr]::new(0x20), [IntPtr]::new(0xC0390001)) | Out-Null
        Start-Sleep -Milliseconds 600
      } elseif ($kind -eq 'text' -and $vals.Count -eq 1) {
        Start-Sleep -Milliseconds 120
        Send-Text $inputHwnd $vals[0]
      } elseif ($kind -eq 'key' -and $vals.Count -eq 1) {
        Send-Key $inputHwnd $vals[0]
      } elseif ($kind -eq 'combo' -and $vals.Count -eq 1) {
        Send-Chord $inputHwnd $vals[0]
      }
    }
  }
  if ($CdpScript) {
    if ($CdpPort -gt 0) { $env:CDP_PORT = "$CdpPort" }
    & node $CdpScript
  }
  Start-Sleep -Milliseconds $PostWaitMs
  $ok = Capture-Window $hwnd $Out
  if (-not $ok) {
    # PrintWindow 失败时用屏幕拷贝兜底（仅普通桌面）
    if ($desktop -eq [IntPtr]::Zero) {
      Start-Sleep -Milliseconds 300
      [GromaShot+RECT]$r = New-Object GromaShot+RECT
      [GromaShot]::GetWindowRect($hwnd, [ref]$r) | Out-Null
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap ($r.right - $r.left), ($r.bottom - $r.top)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($r.left, $r.top, 0, 0, $bmp.Size)
      $g.Dispose()
      $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
    }
  }
  "saved $Out hwnd=$hwnd virtualDesktop=$($desktop -ne [IntPtr]::Zero) printWindow=$ok"

  if ($CaptureProcess -and $CaptureOut) {
    $targetProc = Get-Process $CaptureProcess -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
    if (-not $targetProc) {
      "extra skipped: $CaptureProcess 没有进程"
    } else {
      $extraHwnd = if ($desktop -ne [IntPtr]::Zero) {
        [GromaShot]::FindDesktopProcessWindow($desktop, [uint32]$targetProc.Id)
      } else {
        $targetProc.MainWindowHandle
      }
      if ($extraHwnd -eq [IntPtr]::Zero) {
        "extra skipped: $CaptureProcess 没有可见窗口 pid=$($targetProc.Id)"
      } else {
        $extraOk = Capture-Window $extraHwnd $CaptureOut
        "extra saved $CaptureOut hwnd=$extraHwnd pid=$($targetProc.Id) printWindow=$extraOk"
      }
    }
  }
}
finally {
  if ($proc) { try { $proc | Stop-Process -Force } catch {} }
  if ($procHandle -ne [IntPtr]::Zero) { try { [GromaShot]::TerminateProcess($procHandle, 0) | Out-Null; [GromaShot]::CloseHandle($procHandle) | Out-Null } catch {} }
  Get-Process groma -ErrorAction SilentlyContinue | Stop-Process -Force
  if ($desktop -ne [IntPtr]::Zero) { [GromaShot]::CloseDesktop($desktop) | Out-Null }
}
