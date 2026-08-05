@echo off
title SERVIDOR DE IMPRESSAO - PADARIA PB
color 0A

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

:: Executa o servidor que voce gerou
servidor.exe

pause