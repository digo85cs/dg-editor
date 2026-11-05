#!/bin/bash

# Script para corrigir encoding UTF-8 de todos os arquivos TypeScript e JavaScript
# no DG Editor

set -e

echo "=========================================="
echo "Corrigindo encoding UTF-8 dos arquivos"
echo "=========================================="
echo

# Listar todos os arquivos .ts e .js no src/main e scripts
FILES=$(find src/main scripts -name "*.ts" -o -name "*.js" -o -name "*.cjs" -o -name "*.md" 2>/dev/null)

TOTAL=0
FIXED=0
SKIPPED=0

echo "Encontrados $(echo "$FILES" | wc -l) arquivos para verificar"
echo

for file in $FILES; do
  TOTAL=$((TOTAL + 1))
  
  # Verificar se o arquivo tem caracteres com encoding errado
  if grep -q "^@" "$file" 2>/dev/null || grep -P "[\x80-\xFF]" "$file" 2>/dev/null; then
    echo "[$TOTAL] Corrigindo: $file"
    
    # Fazer backup
    cp "$file" "${file}.backup"
    
    # Converter para UTF-8
    iconv -f UTF-8 -t UTF-8//IGNORE "${file}.backup" > "$file" 2>/dev/null || \
    iconv -f WINDOWS-1252 -t UTF-8 "${file}.backup" > "$file" 2>/dev/null || \
    iconv -f ISO-8859-1 -t UTF-8 "${file}.backup" > "$file" 2>/dev/null || \
    cp "${file}.backup" "$file"
    
    # Remover backup
    rm -f "${file}.backup"
    
    FIXED=$((FIXED + 1))
  else
    SKIPPED=$((SKIPPED + 1))
  fi
done

echo
echo "=========================================="
echo "Resultado:"
echo "  Total: $TOTAL"
echo "  Corrigidos: $FIXED"
echo "  Ok: $SKIPPED"
echo "=========================================="
