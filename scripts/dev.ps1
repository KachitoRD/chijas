# Liberar puertos del emulador de Firebase
$ports = @(4000, 4400, 4500, 8080, 9099)
$freed = @()

foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($processes) {
        foreach ($procId in $processes) {
            try {
                Stop-Process -Id $procId -Force
                $freed += $port
                Write-Host "✓ Liberado puerto $port (PID: $procId)"
            } catch {
                Write-Host "⚠ No se pudo liberar puerto $port (PID: $procId): $_"
            }
        }
    }
}

if ($freed) {
    Write-Host "
⏳ Esperando 2 segundos para que los puertos se liberen..."
    Start-Sleep -Seconds 2
}

Write-Host "
🚀 Iniciando emuladores de Firebase..."
Write-Host "   Proyecto: demo-fijas-vivo"
Write-Host "   Servicios: auth (9099), firestore (8080), ui (4000)"
Write-Host "
📝 Una vez listo, en otra terminal ejecuta: npm run seed"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

firebase emulators:start --only auth,firestore --project demo-fijas-vivo