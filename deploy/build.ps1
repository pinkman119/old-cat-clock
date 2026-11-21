# Windows 原生等价入口（与 build.sh 产物完全一致）
# 用法： .\deploy\build.ps1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$deployDir = $PSScriptRoot
$root = Split-Path -Parent $deployDir
$out = Join-Path $deployDir 'output'

& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker 未运行，请先启动 Docker Desktop' }

function Get-DeployEnv([string]$Key, [string]$Default = '') {
    $file = Join-Path $deployDir '.env'
    if (-not (Test-Path $file)) { $file = Join-Path $deployDir '.env.example' }
    if (-not (Test-Path $file)) { return $Default }
    foreach ($line in (Get-Content $file)) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            $value = $Matches[1].Trim().Trim('"').Trim("'").Trim()
            if ($value) { return $value }
        }
    }
    return $Default
}

$image = Get-DeployEnv 'IMAGE_NAME' 'maomao-clock:0.1.0'
$appTar = Join-Path $out 'maomao-clock.tar'
$dbTar = Join-Path $out 'postgres-16-alpine.tar'

Write-Host "==> 构建应用镜像 $image"
$buildArgs = @('-f', (Join-Path $root 'deploy\Dockerfile'), '--target', 'runtime', '-t', $image)
$npmRegistry = Get-DeployEnv 'NPM_REGISTRY'
if ($npmRegistry) { $buildArgs += @('--build-arg', "NPM_REGISTRY=$npmRegistry") }
$buildArgs += $root
& docker build @buildArgs
if ($LASTEXITCODE -ne 0) { throw '镜像构建失败' }

Write-Host '==> 准备数据库镜像 postgres:16-alpine'
& docker image inspect 'postgres:16-alpine' *> $null
if ($LASTEXITCODE -ne 0) {
    & docker pull 'postgres:16-alpine'
    if ($LASTEXITCODE -ne 0) { throw '数据库镜像拉取失败' }
}

New-Item -ItemType Directory -Path $out -Force | Out-Null
foreach ($file in @($appTar, $dbTar, (Join-Path $out 'docker-compose.yml'), (Join-Path $out 'deploy.env'), (Join-Path $out '.env'))) {
    if (Test-Path $file) { Remove-Item $file -Force }
}

Write-Host '==> 导出镜像与编排配置到 output/'
& docker save -o $appTar $image
if ($LASTEXITCODE -ne 0) { throw '应用镜像导出失败' }
& docker save -o $dbTar 'postgres:16-alpine'
if ($LASTEXITCODE -ne 0) { throw '数据库镜像导出失败' }
Copy-Item (Join-Path $deployDir 'docker-compose.yml') (Join-Path $out 'docker-compose.yml')
$sourceEnv = Join-Path $deployDir '.env'
if (-not (Test-Path $sourceEnv)) {
    $sourceEnv = Join-Path $deployDir '.env.example'
    Write-Host '提示：未找到 deploy\.env，已用 .env.example 生成 output\deploy.env，请在上传前修改密钥与 SERVER_IP。'
}
Copy-Item $sourceEnv (Join-Path $out 'deploy.env')

Write-Host ''
Write-Host "==> 部署包已生成：$out"
Get-ChildItem $out | Select-Object Name, Length | Format-Table -AutoSize
Write-Host '下一步：把 deploy\deploy.sh 与 deploy\output\ 整个目录上传到服务器同一层级，'
Write-Host '       编辑 output\deploy.env（SERVER_IP、MAOMAO_JWT_SECRET、HOST_PORT），执行 ./deploy.sh'
