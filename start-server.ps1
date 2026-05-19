# Simple HTTP Server — เปิดด้วย PowerShell
cd $PSScriptRoot

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:8000/')
$listener.Start()
Write-Host "✅ Server opened at: http://localhost:8000/Doomuenjing%20Dashboard.html" -ForegroundColor Green
Write-Host "📱 Open browser and go to the URL above" -ForegroundColor Cyan

while($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $path = $request.RawUrl.TrimStart('/')
  if($path -eq '' -or $path -eq '/') { $path = 'Doomuenjing Dashboard.html' }

  $fullPath = Join-Path $PSScriptRoot ([System.Web.HttpUtility]::UrlDecode($path))

  if(Test-Path $fullPath -PathType Leaf) {
    $content = [System.IO.File]::ReadAllBytes($fullPath)
    $context.Response.ContentType =
      if($fullPath -like '*.html') { 'text/html' }
      elseif($fullPath -like '*.jsx') { 'application/javascript' }
      elseif($fullPath -like '*.json') { 'application/json' }
      else { 'application/octet-stream' }

    $context.Response.OutputStream.Write($content, 0, $content.Length)
    $context.Response.StatusCode = 200
  } else {
    $context.Response.StatusCode = 404
  }

  $context.Response.Close()
}
