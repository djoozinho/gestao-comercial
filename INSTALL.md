# 🚀 Guia Rápido de Instalação

## ⚡ Início Rápido (5 minutos)

### 1️⃣ Instalar MySQL
```powershell
# Baixe e instale: https://dev.mysql.com/downloads/installer/
# Configure senha do root durante instalação
```

### 2️⃣ Configurar credenciais
Edite o arquivo `.env` e coloque a senha do MySQL:
```env
DB_PASSWORD=SUA_SENHA_AQUI
```

### 3️⃣ Criar banco de dados
```powershell
mysql -u root -p < server/database.sql
```
Digite a senha quando solicitado.

### 4️⃣ Iniciar servidor
```powershell
npm start
```

### 5️⃣ Acessar sistema
Abra o navegador em: **http://localhost:3000**

---

## 📋 Checklist de Instalação

- [ ] MySQL instalado
- [ ] Arquivo `.env` configurado com senha
- [ ] Banco de dados criado (`npm run db:setup` ou comando manual)
- [ ] Dependências instaladas (`npm install`)
- [ ] Servidor iniciado (`npm start`)
- [ ] Navegador aberto em localhost:3000

---

## ❓ Problemas Comuns

**MySQL não conecta?**
```powershell
# Verificar se está rodando
Get-Service MySQL*

# Iniciar serviço
Start-Service MySQL80
```

**Banco não foi criado?**
```powershell
# Criar manualmente
mysql -u root -p
# Depois cole o conteúdo de server/database.sql
```

**Porta 3000 ocupada?**
Mude a porta no arquivo `.env`:
```env
PORT=3001
```

---

## 📱 Usuários e Senhas Padrão

O sistema NÃO tem autenticação por padrão (todos podem acessar).

Para implementar login, veja o README.md completo.

---

## 🎯 Próximos Passos

1. ✅ Acessar Dashboard e explorar
2. ✅ Cadastrar produtos em "Produtos"
3. ✅ Cadastrar clientes em "Pessoas"
4. ✅ Fazer vendas no PDV
5. ✅ Ver relatórios no Dashboard

---

**Documentação Completa**: Veja README.md  
**Suporte**: Consulte a seção "Solução de Problemas" no README.md
