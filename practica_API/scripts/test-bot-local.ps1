# Prueba local del flujo conversacional del MiniBot sin WhatsApp.
# Uso:
#   npm start            (en otra terminal, deja la API corriendo)
#   ./scripts/test-bot-local.ps1
# Parametros opcionales:
#   -BaseUrl http://localhost:3000  -PhoneA 59170000001  -PhoneB 59170000002

param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$PhoneA  = "59170000001",
  [string]$PhoneB  = "59170000002"
)

$ErrorActionPreference = "Stop"

function Send-Msg {
  param([string]$From, [string]$Text)
  $body = @{ from = $From; text = $Text } | ConvertTo-Json -Compress
  $res = Invoke-RestMethod -Uri "$BaseUrl/messages" -Method Post -ContentType "application/json" -Body $body
  $img = if ($res.data.imageUrl) { " [img: $([System.IO.Path]::GetFileName($res.data.imageUrl))]" } else { "" }
  Write-Host ("`n[{0}] >> {1}" -f $From, $Text) -ForegroundColor Cyan
  Write-Host ("   step={0}{1}" -f $res.data.step, $img) -ForegroundColor DarkGray
  Write-Host ("   {0}" -f ($res.message -replace "`n", "`n   "))
  return $res
}

Write-Host "===== PhoneA: alta de cancion =====" -ForegroundColor Yellow
Send-Msg $PhoneA "Hola"                | Out-Null
Send-Msg $PhoneA "Ana"                 | Out-Null
Send-Msg $PhoneA "1"                   | Out-Null
Send-Msg $PhoneA "Numb - Linkin Park"  | Out-Null
Send-Msg $PhoneA "confirmar"           | Out-Null

Write-Host "`n===== PhoneA: poner esa cancion en Reproduciendo =====" -ForegroundColor Yellow
Send-Msg $PhoneA "2" | Out-Null
Send-Msg $PhoneA "1" | Out-Null
Send-Msg $PhoneA "1" | Out-Null

Write-Host "`n===== PhoneB: intenta agregar la MISMA cancion (bloqueo) =====" -ForegroundColor Yellow
Send-Msg $PhoneB "Hola"               | Out-Null
Send-Msg $PhoneB "Beto"               | Out-Null
Send-Msg $PhoneB "1"                  | Out-Null
Send-Msg $PhoneB "Numb - Linkin Park" | Out-Null

Write-Host "`n===== PhoneB: agrega otra cancion (imagen distinta) =====" -ForegroundColor Yellow
Send-Msg $PhoneB "Otra Cancion B" | Out-Null
Send-Msg $PhoneB "confirmar"      | Out-Null

Write-Host "`n===== Robustez: entrada invalida + menu =====" -ForegroundColor Yellow
Send-Msg $PhoneA "asdfghjk" | Out-Null
Send-Msg $PhoneA "menu"     | Out-Null
Send-Msg $PhoneA "3"        | Out-Null

Write-Host "`nListo. Revisa el CRM en $BaseUrl/crm" -ForegroundColor Green
