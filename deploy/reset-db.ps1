# 本机开发环境重置数据库（PostgreSQL 由 apps/server/docker-compose.yml 启动）
# 用法： .\deploy\reset-db.ps1
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    node "$PSScriptRoot\reset-db.cjs"
    if ($LASTEXITCODE -ne 0) { throw '数据库重置失败' }
}
finally {
    Pop-Location
}
