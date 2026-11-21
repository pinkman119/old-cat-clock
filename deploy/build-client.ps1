# 按服务器实际 IP 打包 Windows 桌面客户端（免安装绿色版 + zip）
# 用法： .\deploy\build-client.ps1 -ServerIp 192.168.1.10
#        .\deploy\build-client.ps1 -ServerUrl http://clock.example.com:3000
# 不传地址时读取 deploy\.env 的 SERVER_IP / HOST_PORT，仍未配置则自动探测本机 IPv4。
[CmdletBinding()]
param(
    [string]$ServerIp = '',
    [string]$ServerUrl = '',
    [int]$ServerPort = 0,
    [switch]$NoZip
)
$ErrorActionPreference = 'Stop'
$deployDir = $PSScriptRoot
$root = Split-Path -Parent $deployDir
$outRoot = Join-Path $deployDir 'out'

function Get-DeployEnv([string]$Key, [string]$Default = '') {
    # 优先读部署包里实际生效的配置，其次本地 .env / 模板
    $files = @(
        (Join-Path $deployDir 'output\deploy.env'),
        (Join-Path $deployDir '.env'),
        (Join-Path $deployDir '.env.example')
    )
    foreach ($file in $files) {
        if (-not (Test-Path $file)) { continue }
        foreach ($line in (Get-Content $file)) {
            if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
                $value = $Matches[1].Trim().Trim('"').Trim("'").Trim()
                if ($value) { return $value }
            }
        }
    }
    return $Default
}

function Write-JsonFile([string]$Target, [string]$Json) {
    [System.IO.File]::WriteAllText($Target, $Json, (New-Object System.Text.UTF8Encoding($false)))
}

if ($ServerIp -match '^https?://') { $ServerUrl = $ServerIp; $ServerIp = '' }

if (-not $ServerUrl) {
    if (-not $ServerIp) { $ServerIp = Get-DeployEnv 'SERVER_IP' }
    if (-not $ServerIp) {
        $ServerIp = Get-NetIPConfiguration |
            Where-Object { $_.IPv4DefaultGateway } |
            ForEach-Object { $_.IPv4Address.IPAddress } |
            Where-Object { $_ -and $_ -ne '127.0.0.1' } |
            Select-Object -First 1
    }
    if (-not $ServerIp) { throw '未指定服务器 IP：请用 -ServerIp 指定，或在 deploy\.env 中配置 SERVER_IP' }
    if ($ServerPort -le 0) {
        $portValue = Get-DeployEnv 'HOST_PORT' '3000'
        if ($portValue -match '^\d+$') { $ServerPort = [int]$portValue } else { $ServerPort = 3000 }
    }
    $ServerUrl = "http://${ServerIp}:${ServerPort}"
}
$ServerUrl = $ServerUrl.TrimEnd('/')
$hostLabel = if ($ServerIp) { $ServerIp } else { ([Uri]$ServerUrl).Host }
Write-Host "==> 客户端服务端地址：$ServerUrl"

Write-Host '==> 编译共享包与 Electron 客户端'
Push-Location $root
try {
    & npm run build:shared
    if ($LASTEXITCODE -ne 0) { throw '共享包编译失败' }
    & npm run build -w '@maomao/desktop'
    if ($LASTEXITCODE -ne 0) { throw '客户端编译失败' }
}
finally {
    Pop-Location
}

$electronDist = Join-Path $root 'node_modules\electron\dist'
$desktopDir = Join-Path $root 'apps\desktop'
$required = @(
    (Join-Path $electronDist 'electron.exe'),
    (Join-Path $desktopDir 'dist\main\main.js'),
    (Join-Path $desktopDir 'dist\main\preload.js'),
    (Join-Path $desktopDir 'src\renderer\index.html'),
    (Join-Path $desktopDir 'assets\app-icon.ico'),
    (Join-Path $root 'packages\shared\dist\index.js')
)
foreach ($item in $required) {
    if (-not (Test-Path $item)) { throw "缺少必要文件：$item（请先在项目根目录执行 npm ci 与 npm run build）" }
}

$tag = $hostLabel -replace '[^\w\.\-]', '_'
$pkgDir = Join-Path $outRoot "OldCatClock-$tag"
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
New-Item -ItemType Directory -Path $pkgDir -Force | Out-Null

Write-Host '==> 复制 Electron 运行时与客户端资源'
Copy-Item -Path (Join-Path $electronDist '*') -Destination $pkgDir -Recurse -Force

$appDir = Join-Path $pkgDir 'resources\app'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Copy-Item -Path (Join-Path $desktopDir 'dist') -Destination (Join-Path $appDir 'dist') -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $appDir 'src') -Force | Out-Null
Copy-Item -Path (Join-Path $desktopDir 'src\renderer') -Destination (Join-Path $appDir 'src\renderer') -Recurse -Force
Copy-Item -Path (Join-Path $desktopDir 'assets') -Destination (Join-Path $appDir 'assets') -Recurse -Force

$sharedDir = Join-Path $appDir 'node_modules\@maomao\shared'
New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null
Copy-Item -Path (Join-Path $root 'packages\shared\dist') -Destination (Join-Path $sharedDir 'dist') -Recurse -Force
Copy-Item -Path (Join-Path $root 'packages\shared\package.json') -Destination (Join-Path $sharedDir 'package.json') -Force

Write-JsonFile (Join-Path $appDir 'package.json') (@{ name = 'old-cat-clock'; version = '0.1.0'; main = 'dist/main/main.js' } | ConvertTo-Json)
Write-JsonFile (Join-Path $appDir 'server-config.json') (@{ serverUrl = $ServerUrl } | ConvertTo-Json)
Move-Item -Path (Join-Path $pkgDir 'electron.exe') -Destination (Join-Path $pkgDir 'OldCatClock.exe') -Force

if (-not $NoZip) {
    $zipPath = "$pkgDir.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Write-Host '==> 生成压缩包'
    Compress-Archive -Path (Join-Path $pkgDir '*') -DestinationPath $zipPath -Force
    Write-Host "客户端压缩包：$zipPath"
}

Write-Host "客户端目录：$pkgDir"
Write-Host "服务器地址配置：$(Join-Path $appDir 'server-config.json')（IP 变更时可直接编辑此文件）"
Write-Host "登录账号：huimin / 20001024"
