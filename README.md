# 🚀 Sistema de Gestão Comercial

Sistema completo de gestão comercial com interface moderna e banco de dados MySQL.

## 📋 Funcionalidades

- **Dashboard**: Visão geral do negócio com estatísticas em tempo real
- **PDV (Ponto de Venda)**: Sistema completo de vendas com:
  - Leitura de código de barras
  - Múltiplas formas de pagamento
  - Impressão de recibos
  - Atalhos de teclado
  - Sistema de sons
- **Movimentos**: Gestão de contas a pagar e receber
- **Produtos**: Controle de estoque e cadastro
- **Pessoas**: Cadastro de clientes e fornecedores
- **Relatórios**: Análises e gráficos
- **Agenda**: Gerenciamento de compromissos

## 🛠️ Tecnologias Utilizadas

### Frontend
- HTML5, CSS3, JavaScript
- Bootstrap 4.5.2
- Font Awesome 6.4.0
- Chart.js 3.9.1
- Axios para requisições HTTP
- jQuery 3.5.1

### Backend
- Node.js com Express
- MySQL 8.0+
- mysql2 para conexão com banco
- dotenv para variáveis de ambiente
- UUID para IDs únicos

## 📦 Instalação

### 1. Pré-requisitos

- Node.js 14+ instalado
- MySQL 8.0+ instalado e rodando
- Git (opcional)

### 2. Instalar MySQL

**Windows:**
1. Baixe o MySQL Installer em: https://dev.mysql.com/downloads/installer/
2. Execute o instalador e escolha "Developer Default"
3. Configure a senha do root durante a instalação
4. Anote a senha para usar no arquivo .env

**Verificar instalação:**
```powershell
mysql --version
```

### 3. Clonar/Baixar o projeto

```bash
# Se tiver git
git clone [url-do-repositorio]
cd SOFTWARE

# Ou simplesmente extraia o ZIP para a pasta SOFTWARE
```

### 4. Instalar dependências do Node.js

```powershell
npm install
```

Isso instalará:
- express
- cors
- body-parser
- uuid
- mysql2
- dotenv
- nodemon (desenvolvimento)

### 5. Configurar o banco de dados

#### 5.1. Editar o arquivo .env

Abra o arquivo `.env` na raiz do projeto e configure suas credenciais do MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=SUA_SENHA_AQUI
DB_NAME=gestao_comercial

PORT=3000
NODE_ENV=development
```

**⚠️ IMPORTANTE**: Substitua `SUA_SENHA_AQUI` pela senha do seu MySQL root!

#### 5.2. Criar o banco de dados

Você tem duas opções:

**Opção A - Via comando (Recomendado):**
```powershell
mysql -u root -p < server/database.sql
```
Digite a senha do MySQL quando solicitado.

**Opção B - Via MySQL Workbench:**
1. Abra o MySQL Workbench
2. Conecte ao servidor local
3. Abra o arquivo `server/database.sql`
4. Execute o script (ícone de raio ⚡ ou Ctrl+Shift+Enter)

#### 5.3. Verificar criação

```powershell
mysql -u root -p -e "USE gestao_comercial; SHOW TABLES;"
```

Deve exibir:
- agenda
- pessoas
- produtos
- transacoes
- vendas
- vendas_itens

## 🚀 Executar o Sistema

### Modo Desenvolvimento (com auto-reload):
```powershell
npm run dev
```

### Modo Produção:
```powershell
npm start
```

O servidor iniciará em: **http://localhost:3000**

Você verá no terminal:
```
==================================================
🚀 Servidor rodando com sucesso!
📡 URL: http://localhost:3000
🗄️  Banco: MySQL (gestao_comercial)
✅ Conectado ao MySQL com sucesso!
📊 Banco de dados: gestao_comercial
==================================================
```

## 📂 Estrutura do Projeto

```
SOFTWARE/
├── frontend/              # Interface do usuário
│   ├── index.html        # Página inicial (Movimentos)
│   ├── dashboard.html    # Painel de controle
│   ├── pdv.html          # Ponto de Venda
│   ├── produtos.html     # Cadastro de produtos
│   ├── pessoas.html      # Cadastro de clientes/fornecedores
│   ├── movimentos.html   # Contas a pagar/receber
│   ├── relatorios.html   # Relatórios e gráficos
│   ├── agenda.html       # Agenda de compromissos
│   └── css/
│       └── sidebar.css   # Estilos da barra lateral
├── server/                # Backend
│   ├── index.js          # Servidor Express + API REST
│   ├── database.js       # Módulo de conexão MySQL
│   ├── database.sql      # Script de criação do banco
│   └── data.js           # (deprecated) Dados de exemplo
├── .env                   # Configurações (NÃO COMMITAR!)
├── .env.example          # Exemplo de configuração
├── package.json          # Dependências do projeto
└── README.md             # Este arquivo
```

## 🔧 Solução de Problemas

### Erro: "Cannot connect to MySQL"

1. Verifique se o MySQL está rodando:
```powershell
Get-Service MySQL*
# Se parado, inicie:
Start-Service MySQL80
```

2. Teste a conexão manual:
```powershell
mysql -u root -p
```

3. Verifique as credenciais no arquivo `.env`

### Erro: "Database does not exist"

Execute o script de criação:
```powershell
mysql -u root -p < server/database.sql
```

### Erro: "Access denied for user"

1. Verifique a senha no arquivo `.env`
2. Ou crie um novo usuário:
```sql
CREATE USER 'gestao'@'localhost' IDENTIFIED BY 'sua_senha';
GRANT ALL PRIVILEGES ON gestao_comercial.* TO 'gestao'@'localhost';
FLUSH PRIVILEGES;
```

Depois atualize o `.env`:
```env
DB_USER=gestao
DB_PASSWORD=sua_senha
```

### Porta 3000 já está em uso

Altere a porta no arquivo `.env`:
```env
PORT=3001
```

## 📡 Endpoints da API

### Transações (Movimentos)
- `GET /api/transactions` - Listar transações
- `POST /api/transactions` - Criar transação
- `PUT /api/transactions/:id` - Atualizar transação
- `DELETE /api/transactions/:id` - Deletar transação

### Produtos
- `GET /api/products` - Listar produtos
- `POST /api/products` - Criar produto
- `PUT /api/products/:id` - Atualizar produto
- `DELETE /api/products/:id` - Deletar produto (soft delete)

### Pessoas
- `GET /api/people` - Listar pessoas
- `POST /api/people` - Criar pessoa
- `PUT /api/people/:id` - Atualizar pessoa
- `DELETE /api/people/:id` - Deletar pessoa

### Vendas (PDV)
- `GET /api/sales` - Listar vendas
- `GET /api/sales/:id` - Detalhes da venda
- `POST /api/sales` - Criar venda

### Agenda
- `GET /api/agenda` - Listar eventos
- `POST /api/agenda` - Criar evento
- `PUT /api/agenda/:id` - Atualizar evento
- `DELETE /api/agenda/:id` - Deletar evento

### Dashboard
- `GET /api/dashboard/stats` - Estatísticas gerais

## 🎨 Design System

O sistema utiliza um design premium com:
- Glassmorphism (efeitos de vidro)
- Gradient backgrounds suaves (cinza-azulado)
- Alta legibilidade para todas as idades
- Animações suaves
- Responsivo para mobile

### Cores Principais
- **Background**: Gradiente #f5f7fa → #e4e7eb
- **Primary**: #1f6aa5
- **Success**: #10b981
- **Danger**: #ef4444
- **Warning**: #f59e0b
- **Info**: #3b82f6

## 🔐 Segurança

**IMPORTANTE**: Antes de colocar em produção:

1. Altere as senhas padrão
2. Configure HTTPS
3. Implemente autenticação JWT
4. Adicione validação de entrada
5. Configure CORS adequadamente
6. Use prepared statements (já implementado)
7. Não commite o arquivo `.env` ao Git

## 📝 Próximas Melhorias

- [ ] Sistema de autenticação de usuários
- [ ] Backup automático do banco
- [ ] Exportação de relatórios em PDF
- [ ] Notificações push
- [ ] App mobile
- [ ] Multi-empresa
- [ ] Integração com APIs de pagamento

## 📄 Licença

MIT License - Livre para uso comercial e pessoal.

## 👨‍💻 Suporte

Para dúvidas ou problemas:
1. Verifique a seção "Solução de Problemas"
2. Confira os logs do servidor no terminal
3. Verifique o console do navegador (F12)

---

**Versão**: 2.0.0  
**Data**: Janeiro 2026  
**Status**: ✅ Produção
