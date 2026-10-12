@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MVP-ESTUDY

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 18 ou superior em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
node -v

if not exist ".env" (
  echo.
  echo Aviso: arquivo .env nao encontrado. O app funciona, mas o chat fica desativado.
  echo Para ativar: copie .env.example para .env e preencha ANTHROPIC_API_KEY.
  echo.
)

rem O servidor le o .env sozinho; aqui apenas abrimos o navegador logo depois de subir.
set "PORTA=3000"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"PORT=" ".env" 2^>nul`) do set "PORTA=%%B"
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORTA%"
node server\server.js
pause
