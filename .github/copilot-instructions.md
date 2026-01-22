# Orientações para Agentes de IA - Sistema de Gestão Comercial

## 🧭 Arquitetura (Big Picture)

- **Monolito Node.js/Express**: Backend em `server/index.js` (~5000 linhas), Frontend estático em `frontend/*.html` (não é SPA)
- **Multi-tenant**: Sistema de isolamento por empresa via `server/auth.js` — cada tenant tem banco separado em `server/tenants/`
- **Banco dual**: MySQL preferencial, SQLite fallback automático — ver `server/database.js` para wrapper unificado
- **Autenticação JWT**: Roles hierárquicos: `superadmin > admin > gerente > caixa > user` — proteção via `frontend/js/auth-guard.js`

## 🛠 Arquivos-Chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `server/index.js` | Todos endpoints REST (`/api/*`), middleware tenant, ~180 rotas |
| `server/database.js` | Wrapper MySQL/SQLite, helpers `toCamelCase`/`toSnakeCase` |
| `server/auth.js` | Login, JWT, multi-tenant, roles, sessões |
| `frontend/js/auth-guard.js` | Proteção de páginas, verificação de roles, logout |
| `frontend/js/branding.js` | Customização visual por empresa |
| `server/migrate-*.js` | Scripts de migração (executar: `node server/migrate-cadastros.js`) |

## ⚙️ Comandos de Dev

```bash
npm install          # Instalar dependências
npm run dev          # Servidor com nodemon (hot-reload)
npm start            # Produção
node server/test-api.js  # Smoke test dos endpoints
```

**Debug Windows** — Se `EADDRINUSE`:
```powershell
tasklist | findstr node
Stop-Process -Id <pid> -Force
```

## 💡 Padrões do Projeto (siga rigorosamente)

### API REST
```
GET    /api/resource?search=termo
POST   /api/resource          { ...dados }
PUT    /api/resource/:id      { ...dados }
DELETE /api/resource/:id
```

### Frontend (padrão por página)
- Lista em `#<resource>List`, modal em `#<resource>Modal`
- Funções: `loadX()`, `openModal()`, `saveX()`, `deleteX()`
- Use `/api` relativo (não hardcode `http://localhost:3000`)

### Banco de Dados
- DB usa `snake_case`, frontend usa `camelCase`
- IDs: `uuidv4()` para novas entidades
- Compatibilidade: `result.affectedRows` (MySQL) vs `result.changes` (SQLite)

## 🔌 Integrações Implementadas

### PIX/Mercado Pago (`server/index.js` linhas 4333+)
```
GET  /api/pix/configurado     # Verifica se MP está ativo
POST /api/pix/gerar           # { amount, description } → QR Code
GET  /api/pix/status/:id      # Status do pagamento
```
- Credenciais em tabela `integracoes` (JSON config)
- Frontend: `frontend/integracoes.html` campos específicos MP

### Impressão (`server/print-service.js`)
- Suporte ESC/POS para impressoras térmicas
- Endpoint: `POST /api/print/receipt`

## ⚠️ Armadilhas Comuns

1. **Payload 413**: Produtos têm `photo` base64 — NUNCA envie em `notes` ou cart completo
   ```js
   // ❌ Errado: enviar produto completo com foto
   // ✅ Certo: { id, code, name, price, qty }
   ```

2. **Tenant não isolado**: Use `getDatabase(req)` em handlers para pegar conexão correta
   ```js
   const database = getDatabase(req); // Usa req.tenantDb se disponível
   ```

3. **SQLite vs MySQL**: Ao alterar schema, atualize AMBOS:
   - `server/database.sql` (MySQL)
   - `server/database-sqlite.js` → `createTables()` (SQLite)

4. **Auth não aplicado**: Sempre inclua `auth-guard.js` antes de outros scripts no HTML

## 📋 Checklist para Novos Recursos

1. [ ] Endpoint em `server/index.js` (seguir padrões existentes)
2. [ ] Migração em `server/migrate-*.js` se criar tabela
3. [ ] HTML em `frontend/<recurso>.html` + JS em `frontend/js/<recurso>.js`
4. [ ] Adicionar permissões em `PAGE_PERMISSIONS` no `auth-guard.js`
5. [ ] Testar: `npm run dev` → `http://localhost:3000/<recurso>.html`

## 🔍 Debugging Útil

```
GET /api/debug/status    # PID, uptime, contagens do DB
GET /api/debug/events    # Buffer de eventos PDV (limite com ?limit=N)
```

**Logs do tenant middleware**: Procure por `[TENANT-MW]` no console do servidor
