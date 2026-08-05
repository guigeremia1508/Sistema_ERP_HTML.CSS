@echo off
title SERVIDOR DE IMPRESSAO - PADARIA PB
color 0A

:: Garante que o terminal rode exatamente na pasta onde o arquivo .bat esta guardado
cd /d "%~dp0"

echo ===================================================
echo   CONFIGURANDO E INICIANDO SERVIDOR DE IMPRESSAO
echo ===================================================
echo.

:: Tenta compartilhar a impressora automaticamente como 'termica'
net share termica="POS58 Printer" /grant:todos,full >nul 2>&1

echo [OK] Impressora mapeada como 'termica'
echo [OK] Iniciando servidor de impressao...
echo.
echo ===================================================
echo   DEIXE ESTA JANELA ABERTA ENQUANTO USAR O SITE
echo ===================================================
echo.

:: Executa o servidor compilado na mesma pasta
servidor.exe

pause