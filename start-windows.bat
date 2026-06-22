@echo off
setlocal
cd /d %~dp0
start "Perfume Backend" cmd /k "cd backend && npm run dev"
start "Perfume Storefront" cmd /k "cd frontend && npm run dev"
start "Perfume Admin" cmd /k "cd admin && npm run dev"
endlocal
