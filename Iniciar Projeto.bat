@echo off
cd /d "%~dp0"

if not exist "backend\.env" (
  echo.
  echo [AVISO] Falta backend\.env
  echo Copie backend\.env.example para backend\.env e defina DATABASE_URL ^(Session pooler no Supabase^).
  echo Ver README.md na raiz do projeto.
  echo.
)

start "Symphony AI - Backend" cmd /k cd /d "%~dp0backend" ^&^& npm run dev
start "Symphony AI - Frontend" cmd /k cd /d "%~dp0frontend" ^&^& npm run dev
