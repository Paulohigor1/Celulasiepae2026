# Célula mais próxima (Angra dos Reis) + Admin (Login) + SQLite + Mapa embutido

## Rodar localmente
1) Node.js 18+ (recomendado 20+)
2) Na pasta do projeto:
   npm install
   npm run dev

Abra:
- http://localhost:3000
- http://localhost:3000/admin.html

## Configurar login do admin (PowerShell)
$env:ADMIN_USER="admin"
$env:ADMIN_PASS="SENHA_FORTE"
$env:ADMIN_SECRET="SEGREDO_GRANDE"
npm run dev

## SQLite
Banco em ./data/cells.db (criado automaticamente)
