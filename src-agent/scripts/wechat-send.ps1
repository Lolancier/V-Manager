$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class VManagerNativeMethods {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Write-JsonResult {
    param([hashtable]$Value)
    $Value | ConvertTo-Json -Compress -Depth 6
}

function Get-ForegroundProcessId {
    $window = [VManagerNativeMethods]::GetForegroundWindow()
    [uint32]$processId = 0
    [void][VManagerNativeMethods]::GetWindowThreadProcessId($window, [ref]$processId)
    return [int]$processId
}

function Assert-WeChatForeground {
    param([int]$ExpectedProcessId)
    if ((Get-ForegroundProcessId) -ne $ExpectedProcessId) {
        throw "微信不再是前台窗口，已停止自动发送。"
    }
}

function Get-SupportedPattern {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [System.Windows.Automation.AutomationPattern]$Pattern
    )
    $value = $null
    if ($Element.TryGetCurrentPattern($Pattern, [ref]$value)) {
        return $value
    }
    return $null
}

function Get-VisibleExactNameElements {
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Name
    )
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty,
        $Name
    )
    $matches = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    $visible = @()
    foreach ($match in $matches) {
        try {
            if (-not $match.Current.IsOffscreen -and $match.Current.IsEnabled) {
                $visible += $match
            }
        } catch {
            continue
        }
    }
    return @($visible)
}

function Get-ActionableAncestor {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [System.Windows.Automation.AutomationElement]$Root
    )
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $current = $Element
    for ($depth = 0; $depth -lt 6 -and $null -ne $current; $depth += 1) {
        $invoke = Get-SupportedPattern $current ([System.Windows.Automation.InvokePattern]::Pattern)
        $selection = Get-SupportedPattern $current ([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($null -ne $invoke -or $null -ne $selection) {
            return $current
        }
        if ($current -eq $Root) { break }
        $current = $walker.GetParent($current)
    }
    return $null
}

function Get-ElementIdentity {
    param([System.Windows.Automation.AutomationElement]$Element)
    try {
        $rect = $Element.Current.BoundingRectangle
        return "{0:F0}:{1:F0}:{2:F0}:{3:F0}" -f $rect.X, $rect.Y, $rect.Width, $rect.Height
    } catch {
        return [guid]::NewGuid().ToString()
    }
}

function Select-ExactContact {
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Contact,
        [bool]$AllowKeyboardFallback
    )
    $matches = Get-VisibleExactNameElements $Root $Contact
    if ($matches.Count -eq 0) {
        if ($AllowKeyboardFallback) {
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            return "first_result_keyboard"
        }
        throw "没有在微信搜索结果中找到完全匹配的联系人：$Contact"
    }

    $candidates = @{}
    foreach ($match in $matches) {
        $actionable = Get-ActionableAncestor $match $Root
        if ($null -eq $actionable) { continue }
        $identity = Get-ElementIdentity $actionable
        if (-not $candidates.ContainsKey($identity)) {
            $candidates[$identity] = $actionable
        }
    }
    if ($candidates.Count -eq 0) {
        if ($AllowKeyboardFallback) {
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            return "first_result_keyboard"
        }
        throw ("找到了联系人 {0}，但当前微信版本没有暴露可安全操作的联系人控件。" -f $Contact)
    }
    if ($candidates.Count -ne 1) {
        throw ("搜索到多个同名联系人 {0}，为避免发错人已停止。" -f $Contact)
    }

    $target = @($candidates.Values)[0]
    $selection = Get-SupportedPattern $target ([System.Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $selection) {
        $selection.Select()
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        return "selection"
    }
    $invoke = Get-SupportedPattern $target ([System.Windows.Automation.InvokePattern]::Pattern)
    if ($null -ne $invoke) {
        $invoke.Invoke()
        return "invoke"
    }
    $target.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    return "focus_enter"
}

function Set-SafeClipboardText {
    param(
        [string]$Text,
        [hashtable]$ClipboardState
    )
    $dataObject = [System.Windows.Forms.Clipboard]::GetDataObject()
    $formats = if ($null -ne $dataObject) { @($dataObject.GetFormats()) } else { @() }
    if ($formats.Count -gt 0 -and -not [System.Windows.Forms.Clipboard]::ContainsText()) {
        throw "当前剪贴板含有非文本内容，无法无损暂存；已停止自动发送。"
    }
    if (-not $ClipboardState.ContainsKey("captured")) {
        $ClipboardState.captured = $true
        $ClipboardState.hadText = [System.Windows.Forms.Clipboard]::ContainsText()
        $ClipboardState.text = if ($ClipboardState.hadText) { [System.Windows.Forms.Clipboard]::GetText() } else { "" }
    }
    [System.Windows.Forms.Clipboard]::SetText($Text)
}

function Set-AutomationText {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [string]$Text,
        [hashtable]$ClipboardState
    )
    $valuePattern = Get-SupportedPattern $Element ([System.Windows.Automation.ValuePattern]::Pattern)
    if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
        $valuePattern.SetValue($Text)
        return "value_pattern"
    }

    Set-SafeClipboardText $Text $ClipboardState
    $Element.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    return "clipboard"
}

function Get-MessageInput {
    param([System.Windows.Automation.AutomationElement]$Root)
    $rootRect = $Root.Current.BoundingRectangle
    $editCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit
    )
    $documentCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Document
    )
    $elements = @($Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition))
    $elements += @($Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $documentCondition))
    $candidates = @()
    foreach ($element in $elements) {
        try {
            $rect = $element.Current.BoundingRectangle
            if (
                -not $element.Current.IsOffscreen -and
                $element.Current.IsEnabled -and
                $element.Current.IsKeyboardFocusable -and
                $rect.Width -ge 160 -and
                $rect.Height -ge 30 -and
                $rect.Top -ge ($rootRect.Top + $rootRect.Height * 0.45)
            ) {
                $candidates += [pscustomobject]@{ Element = $element; Area = $rect.Width * $rect.Height }
            }
        } catch {
            continue
        }
    }
    if ($candidates.Count -eq 0) {
        throw "没有找到微信消息输入框，可能是微信版本暂不兼容。"
    }
    return ($candidates | Sort-Object Area -Descending | Select-Object -First 1).Element
}

function Invoke-Send {
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [System.Windows.Automation.AutomationElement]$Input,
        [string]$SendMode
    )
    $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button
    )
    $buttons = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    $rootRect = $Root.Current.BoundingRectangle
    foreach ($button in $buttons) {
        try {
            $rect = $button.Current.BoundingRectangle
            if (
                -not $button.Current.IsOffscreen -and
                $button.Current.IsEnabled -and
                $button.Current.Name -match "^发送(?:\(|$)" -and
                $rect.Top -ge ($rootRect.Top + $rootRect.Height * 0.55)
            ) {
                $invoke = Get-SupportedPattern $button ([System.Windows.Automation.InvokePattern]::Pattern)
                if ($null -ne $invoke) {
                    $invoke.Invoke()
                    return "send_button"
                }
            }
        } catch {
            continue
        }
    }

    $Input.SetFocus()
    if ($SendMode -eq "ctrl_enter") {
        [System.Windows.Forms.SendKeys]::SendWait("^{ENTER}")
        return "ctrl_enter"
    }
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    return "enter"
}

$contact = [Environment]::GetEnvironmentVariable("VM_WECHAT_CONTACT")
$message = [Environment]::GetEnvironmentVariable("VM_WECHAT_MESSAGE")
$sendMode = [Environment]::GetEnvironmentVariable("VM_WECHAT_SEND_MODE")
$allowKeyboardFallback = [Environment]::GetEnvironmentVariable("VM_WECHAT_KEYBOARD_FALLBACK") -eq "true"
$clipboardState = @{}

try {
    $allWeChatProcesses = @(
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ProcessName -match "^(WeChat|Weixin)$" } |
            Sort-Object StartTime
    )
    $processes = @(
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ProcessName -match "^(WeChat|Weixin|WeChatAppEx)$" -and $_.MainWindowHandle -ne 0 } |
            Sort-Object StartTime
    )
    if ($processes.Count -eq 0 -and $allWeChatProcesses.Count -gt 0) {
        $executable = @($allWeChatProcesses | ForEach-Object {
            try { $_.Path } catch { $null }
        } | Where-Object { $_ } | Select-Object -Unique | Select-Object -First 1)
        if ($executable.Count -gt 0) {
            Start-Process -FilePath $executable[0] | Out-Null
            Start-Sleep -Milliseconds 1200
            $processes = @(
                Get-Process -ErrorAction SilentlyContinue |
                    Where-Object { $_.ProcessName -match "^(WeChat|Weixin|WeChatAppEx)$" -and $_.MainWindowHandle -ne 0 } |
                    Sort-Object StartTime
            )
        }
    }
    if ($processes.Count -eq 0) {
        throw "当前没有可操作的微信主窗口；请先登录微信并打开主窗口。"
    }
    if ($processes.Count -gt 1) {
        throw "检测到多个微信主窗口，暂时无法安全判断要操作哪一个。"
    }

    $wechat = $processes[0]
    $windowHandle = [IntPtr]$wechat.MainWindowHandle
    [void][VManagerNativeMethods]::ShowWindowAsync($windowHandle, 9)
    [void][VManagerNativeMethods]::SetForegroundWindow($windowHandle)
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.AppActivate($wechat.Id)
    Start-Sleep -Milliseconds 450
    Assert-WeChatForeground $wechat.Id

    [System.Windows.Forms.SendKeys]::SendWait("^f")
    Start-Sleep -Milliseconds 350
    Assert-WeChatForeground $wechat.Id
    $searchInput = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $searchInput) {
        throw "没有找到微信联系人搜索框。"
    }
    $searchInput.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    $searchMethod = Set-AutomationText $searchInput $contact $clipboardState
    Start-Sleep -Milliseconds 900
    Assert-WeChatForeground $wechat.Id

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($windowHandle)
    $contactMethod = Select-ExactContact $root $contact $allowKeyboardFallback
    Start-Sleep -Milliseconds 750
    Assert-WeChatForeground $wechat.Id

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($windowHandle)
    $contactVerified = $contactMethod -ne "first_result_keyboard"
    if ($contactVerified) {
        $titleMatches = Get-VisibleExactNameElements $root $contact
        if ($titleMatches.Count -eq 0) {
            throw ("打开会话后无法再次确认联系人 {0}，已停止发送。" -f $contact)
        }

        $input = Get-MessageInput $root
        $input.SetFocus()
        [System.Windows.Forms.SendKeys]::SendWait("^a")
        $messageMethod = Set-AutomationText $input $message $clipboardState
        Start-Sleep -Milliseconds 180
        Assert-WeChatForeground $wechat.Id
        $sendMethod = Invoke-Send $root $input $sendMode
    } else {
        Set-SafeClipboardText $message $clipboardState
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        $messageMethod = "keyboard_clipboard"
        Start-Sleep -Milliseconds 180
        Assert-WeChatForeground $wechat.Id
        if ($sendMode -eq "ctrl_enter") {
            [System.Windows.Forms.SendKeys]::SendWait("^{ENTER}")
            $sendMethod = "ctrl_enter"
        } else {
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            $sendMethod = "enter"
        }
    }

    Write-JsonResult @{
        ok = $true
        contact = $contact
        processId = $wechat.Id
        searchMethod = $searchMethod
        contactMethod = $contactMethod
        contactVerified = $contactVerified
        messageMethod = $messageMethod
        sendMethod = $sendMethod
    }
} catch {
    Write-JsonResult @{
        ok = $false
        contact = $contact
        error = $_.Exception.Message
    }
    exit 2
} finally {
    if ($clipboardState.captured) {
        try {
            if ($clipboardState.hadText) {
                [System.Windows.Forms.Clipboard]::SetText([string]$clipboardState.text)
            } else {
                [System.Windows.Forms.Clipboard]::Clear()
            }
        } catch {
            # Clipboard restoration failure must not hide the automation result.
        }
    }
}
