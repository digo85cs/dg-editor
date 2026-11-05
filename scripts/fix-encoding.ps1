<#
.SYNOPSIS
    Corrigir encoding UTF-8 de todos os arquivos TypeScript, JavaScript e Markdown
.DESCRIPTION
    Este script verifica e corrige o encoding de todos os arquivos .ts, .js, .cjs e .md
    para UTF-8 sem BOM no diretório src/main e scripts
#>

param()

Write-Host "=========================================="
Write-Host "Corrigindo encoding UTF-8 dos arquivos"
Write-Host "=========================================="
Write-Host ""

# Listar todos os arquivos para verificar
$files = Get-ChildItem -Path "src/main" -Recurse -Include *.ts,*.js,*.cjs,*.md -File
$files += Get-ChildItem -Path "scripts" -Recurse -Include *.ts,*.js,*.cjs,*.md,*.sh,*.ps1 -File

Write-Host "Encontrados $($files.Count) arquivos para verificar"
Write-Host ""

$total = 0
$fixed = 0
$skipped = 0

foreach ($file in $files) {
    $total++
    
    try {
        # Ler o conteúdo do arquivo
        $content = Get-Content -Path $file.Path -Raw -Encoding Default
        
        # Verificar se o conteúdo tem caracteres não UTF-8
        $hasInvalidChars = $false
        
        # Tentar detectar encoding errado
        if ($content -match "[\x80-\xFF]" -or $content -match "\?\?" -or $content -match "^@") {
            $hasInvalidChars = $true
        }
        
        # Verificar se tem BOM
        $hasBOM = $false
        $bytes = [System.IO.File]::ReadAllBytes($file.Path)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $hasBOM = $true
        }
        
        if ($hasInvalidChars -or $hasBOM) {
            Write-Host "[$total] Corrigindo: $($file.Path)"
            
            # Tentar ler como UTF-8 e salvar novamente
            try {
                $utf8Content = Get-Content -Path $file.Path -Raw -Encoding UTF8
                
                # Salvar sem BOM
                [System.IO.File]::WriteAllText($file.Path, $utf8Content, [System.Text.Encoding]::UTF8)
                
                $fixed++
            } catch {
                Write-Warning "  Falhou ao ler como UTF-8, tentando ISO-8859-1"
                try {
                    $isoContent = Get-Content -Path $file.Path -Raw -Encoding ISO88591
                    [System.IO.File]::WriteAllText($file.Path, $isoContent, [System.Text.Encoding]::UTF8)
                    $fixed++
                } catch {
                    Write-Warning "  Falhou ao ler como ISO-8859-1, tentando Default"
                    [System.IO.File]::WriteAllText($file.Path, $content, [System.Text.Encoding]::UTF8)
                    $fixed++
                }
            }
        } else {
            $skipped++
        }
    } catch {
        Write-Error "  ERRO: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "Resultado:"
Write-Host "  Total: $total"
Write-Host "  Corrigidos: $fixed"
Write-Host "  Ok: $skipped"
Write-Host "=========================================="
