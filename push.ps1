$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
Write-Host ""
Write-Host "========== HERO 一键推送 =========="
Write-Host " 用法: push.bat [提交说明]"
Write-Host ' 例:   push.bat "修好了港口黑屏"'
Write-Host "==================================="
Write-Host ""

if (-not (Test-Path ".git")) {
    Write-Host "[错误] 当前目录不是 git 仓库。"
    Read-Host "按回车退出"
    exit 1
}

# ---- 步骤 1: 自动提交 ----
$dirty = (git status --porcelain | Measure-Object -Line).Lines
if ([int]$dirty -gt 0) {
    Write-Host "[1/4] 检测到 $dirty 个文件有改动,自动提交..."
    git add -A
    if ($args.Count -gt 0) { $msg = $args[0] }
    else { $msg = "自动提交 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
    # 经 UTF-8 临时文件传消息,避免 PowerShell 按系统 GBK 编码参数导致 git log 乱码
    $tmpMsg = Join-Path $env:TEMP 'hero-commit-msg.txt'
    [System.IO.File]::WriteAllText($tmpMsg, $msg + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    git commit -F $tmpMsg
    Remove-Item $tmpMsg -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[错误] git commit 失败。常见原因: 没配置身份,运行下面两行修一次即可:"
        Write-Host '  git config --global user.name "你的名字"'
        Write-Host '  git config --global user.email "你的邮箱"'
        Read-Host "按回车退出"
        exit 1
    }
} else {
    Write-Host "[1/4] 没有未提交的改动,跳过提交。"
}
Write-Host ""

# ---- 步骤 2: 获取远端状态 ----
Write-Host "[2/4] 连接 GitHub 获取远端状态(先走 7890 代理)..."
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 fetch origin 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      代理不通,尝试直连..."
    git -c http.proxy= -c https.proxy= fetch origin 2>$null | Out-Null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[错误] 连不上 GitHub。代理和直连都失败,检查: 代理软件是否开着 / 网络是否可用。"
    Read-Host "按回车退出"
    exit 1
}
Write-Host "      远端状态已获取。"
Write-Host ""

# ---- 步骤 3: 版本落后检查(落后即中止,不自动合并) ----
$behind = [int](git rev-list --count HEAD..origin/main)
$ahead  = [int](git rev-list --count origin/main..HEAD)
if ($behind -gt 0) {
    Write-Host ""
    Write-Host "===================================================="
    Write-Host " [受阻] 版本落后: 远端比本地多 $behind 个提交"
    Write-Host "        (同时本地比远端多 $ahead 个提交未推送)"
    Write-Host " --------------------------------------------------"
    git log --oneline HEAD..origin/main | ForEach-Object { Write-Host "  $_" }
    Write-Host " --------------------------------------------------"
    Write-Host " 已按要求中止,不做自动合并(避免覆盖任何一边)。"
    Write-Host " 把上面这份输出发给 ZCode 处理即可。"
    Write-Host "===================================================="
    Read-Host "按回车退出"
    exit 2
}
Write-Host "[3/4] 版本检查通过(远端没有新提交)。"
Write-Host ""

# ---- 步骤 4: 推送 ----
Write-Host "[4/4] 推送中(先走 7890 代理)..."
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin main 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      代理推送失败,尝试直连..."
    git -c http.proxy= -c https.proxy= push origin main 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[错误] 代理和直连都推送失败。"
        Write-Host "若提示 non-fast-forward: 远端刚刚有了新提交,重新跑一次本脚本,"
        Write-Host "步骤 3 会拦下来并显示详情;其他情况把报错发给 ZCode。"
        Read-Host "按回车退出"
        exit 3
    }
    Write-Host "      直连推送成功。"
} else {
    Write-Host "      代理推送成功。"
}

Write-Host ""
Write-Host "========== 完成! 本地与 GitHub 已同步 =========="
Write-Host " 最新提交: $(git log --oneline -1)"
Write-Host "================================================"
Read-Host "按回车退出"
exit 0
