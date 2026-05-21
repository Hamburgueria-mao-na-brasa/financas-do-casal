$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4173
$Prefix = "http://localhost:$Port/"

Add-Type -AssemblyName System.Net.HttpListener

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
  $listener.Start()
  Start-Process $Prefix
  Write-Host "App aberto em $Prefix"
  Write-Host "Feche esta janela para parar o servidor."

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($requestPath)) {
      $requestPath = "index.html"
    }

    $filePath = Join-Path $Root $requestPath
    $resolvedRoot = [System.IO.Path]::GetFullPath($Root)
    $resolvedFile = [System.IO.Path]::GetFullPath($filePath)

    if (-not $resolvedFile.StartsWith($resolvedRoot)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (-not (Test-Path -LiteralPath $resolvedFile -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }

    $extension = [System.IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()
    $contentType = switch ($extension) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "text/javascript; charset=utf-8" }
      ".json" { "application/json; charset=utf-8" }
      ".svg" { "image/svg+xml" }
      default { "application/octet-stream" }
    }

    $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
    $context.Response.ContentType = $contentType
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
}
finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
