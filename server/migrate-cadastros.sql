-- Migration: Cadastros Principais
-- Executar: mysql -u root -p gestao_comercial < server/migrate-cadastros.sql

USE gestao_comercial;

-- ============================================
-- TABELA DE DEPARTAMENTOS/GRUPOS
-- ============================================
CREATE TABLE IF NOT EXISTS departamentos (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(20),
  name VARCHAR(100) NOT NULL,
  parent_id VARCHAR(36) DEFAULT NULL,
  level ENUM('departamento', 'grupo', 'subgrupo') DEFAULT 'departamento',
  description TEXT,
  margin_percent DECIMAL(5,2) DEFAULT 0.00,
  commission_percent DECIMAL(5,2) DEFAULT 0.00,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES departamentos(id) ON DELETE SET NULL,
  INDEX idx_code (code),
  INDEX idx_name (name),
  INDEX idx_parent (parent_id),
  INDEX idx_level (level),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA DE USUÁRIOS / PERFIS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  role VARCHAR(50),
  active BOOLEAN DEFAULT TRUE,
  permissions JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemplo de usuário
INSERT INTO users (id, name, email, role, active, permissions) VALUES
('user_admin', 'Administrador', 'admin@local', 'Admin', TRUE, '{"cancel":true,"changePrice":true,"reports":true}')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================
-- TABELA DE INTEGRAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS integracoes (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  config JSON DEFAULT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_integracoes_type (type),
  INDEX idx_integracoes_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemplo de integração (PIX QR dinâmico)
INSERT INTO integracoes (id, name, type, active, config) VALUES
('int_pix_1', 'PIX - Gateway Exemplo', 'PIX', TRUE, '{"gateway":"pagseguro","qrType":"dynamic"}')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Adiciona coluna 'logo' em empresas (se ainda não existir)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo VARCHAR(255) DEFAULT NULL;

-- ============================================
-- TABELA DE REGRAS DE ESTOQUE
-- ============================================
CREATE TABLE IF NOT EXISTS estoque (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  min DECIMAL(10,2) DEFAULT 0.00,
  max DECIMAL(10,2) DEFAULT 0.00,
  reorder DECIMAL(10,2) DEFAULT 0.00,
  turnover DECIMAL(10,2) DEFAULT 0.00,
  inventory VARCHAR(50),
  alert_enabled BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_estoque_name (name),
  INDEX idx_estoque_alert (alert_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemplo de regra
INSERT INTO estoque (id, name, min, max, reorder, turnover, inventory, alert_enabled, description) VALUES
('est_1', 'Regra Padrão', 3, 100, 5, 30, 'monthly', TRUE, 'Regra padrão de demonstração')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================
-- TABELA FINANCEIRO (PLANOS, CATEGORIAS, CONTAS, CENTROS)
-- ============================================
CREATE TABLE IF NOT EXISTS financeiro (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  resource VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_financeiro_name (name),
  INDEX idx_financeiro_resource (resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO financeiro (id, name, type, resource, description) VALUES
('fin_plano_1', 'Plano Padrão', 'Receita', 'plano', 'Plano de contas padrão'),
('fin_cat_1', 'Vendas', 'Receita', 'categoria', 'Categoria de receitas de vendas'),
('fin_acc_1', 'Conta Banco X', 'Corrente', 'bancaria', 'Conta bancária principal'),
('fin_cc_1', 'Centro Geral', 'Interno', 'centro', 'Centro de custo padrão')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================
-- TABELA DE RECIBOS / RECEIPTS
-- ============================================
CREATE TABLE IF NOT EXISTS receipts (
  id VARCHAR(36) PRIMARY KEY,
  transaction_id VARCHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(50),
  note TEXT,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transacoes(id) ON DELETE CASCADE,
  INDEX idx_receipts_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA DE COMISSÕES E METAS
-- ============================================
CREATE TABLE IF NOT EXISTS comissoes (
  id VARCHAR(36) PRIMARY KEY,
  vendor_name VARCHAR(255),
  percent DECIMAL(5,2) DEFAULT 0.00,
  bonus DECIMAL(10,2) DEFAULT 0.00,
  target DECIMAL(10,2) DEFAULT 0.00,
  period VARCHAR(50),
  paid BOOLEAN DEFAULT FALSE,
  rank INT DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comissoes_vendor (vendor_name),
  INDEX idx_comissoes_paid (paid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO comissoes (id, vendor_name, percent, bonus, target, period, paid, rank, description) VALUES
('com_1', 'Carlos Vendedor', 5.00, 50.00, 1000.00, 'monthly', TRUE, 1, 'Comissão padrão para Carlos'),
('com_2', 'Ana Vendedora', 4.50, 30.00, 800.00, 'monthly', FALSE, 2, 'Meta de Ana'),
('com_3', 'João Vendedor', 6.00, 0.00, 1500.00, 'quarterly', FALSE, 3, 'Meta Trimestral')
ON DUPLICATE KEY UPDATE vendor_name = VALUES(vendor_name);

-- ============================================
-- CAMPOS EXTRAS PARA FUNCIONÁRIOS
-- ============================================
ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT NULL AFTER birth_date,
  ADD COLUMN IF NOT EXISTS position VARCHAR(100) DEFAULT NULL AFTER hire_date,
  ADD COLUMN IF NOT EXISTS department_id VARCHAR(36) DEFAULT NULL AFTER position,
  ADD COLUMN IF NOT EXISTS salary DECIMAL(10,2) DEFAULT 0.00 AFTER department_id,
  ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2) DEFAULT 0.00 AFTER salary,
  ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255) DEFAULT NULL AFTER commission_percent,
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) DEFAULT NULL AFTER pix_key,
  ADD COLUMN IF NOT EXISTS bank_agency VARCHAR(20) DEFAULT NULL AFTER bank_name,
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(30) DEFAULT NULL AFTER bank_agency,
  ADD COLUMN IF NOT EXISTS work_schedule VARCHAR(100) DEFAULT NULL AFTER bank_account,
  ADD COLUMN IF NOT EXISTS seller_code VARCHAR(20) DEFAULT NULL AFTER work_schedule,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE AFTER notes;

-- ============================================
-- CAMPOS EXTRAS PARA FORNECEDORES
-- ============================================
ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100) DEFAULT NULL AFTER active,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT NULL AFTER contact_name,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100) DEFAULT NULL AFTER contact_phone,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(10,2) DEFAULT 0.00 AFTER payment_terms,
  ADD COLUMN IF NOT EXISTS supplier_category VARCHAR(100) DEFAULT NULL AFTER credit_limit;

-- ============================================
-- VINCULAR PRODUTOS A DEPARTAMENTOS
-- ============================================
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS department_id VARCHAR(36) DEFAULT NULL AFTER category,
  ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(36) DEFAULT NULL AFTER department_id;

-- Criar índices
ALTER TABLE pessoas ADD INDEX IF NOT EXISTS idx_department (department_id);
ALTER TABLE pessoas ADD INDEX IF NOT EXISTS idx_active (active);
ALTER TABLE pessoas ADD INDEX IF NOT EXISTS idx_seller_code (seller_code);
ALTER TABLE produtos ADD INDEX IF NOT EXISTS idx_department_id (department_id);
ALTER TABLE produtos ADD INDEX IF NOT EXISTS idx_supplier_id (supplier_id);

-- ============================================
-- DADOS DE EXEMPLO
-- ============================================

-- Departamentos
INSERT INTO departamentos (id, code, name, level, description, margin_percent) VALUES
('dep_1', 'DEP01', 'Medicamentos', 'departamento', 'Medicamentos em geral', 30.00),
('dep_2', 'DEP02', 'Perfumaria', 'departamento', 'Produtos de beleza e higiene', 40.00),
('dep_3', 'DEP03', 'Conveniência', 'departamento', 'Produtos de conveniência', 50.00)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Grupos dentro de Medicamentos
INSERT INTO departamentos (id, code, name, level, parent_id, description, margin_percent) VALUES
('grp_1', 'GRP01', 'Genéricos', 'grupo', 'dep_1', 'Medicamentos genéricos', 25.00),
('grp_2', 'GRP02', 'Referência', 'grupo', 'dep_1', 'Medicamentos de referência', 35.00),
('grp_3', 'GRP03', 'Controlados', 'grupo', 'dep_1', 'Medicamentos controlados', 28.00)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Funcionário exemplo
INSERT INTO pessoas (id, code, name, type, document, email, phone, position, commission_percent, active) VALUES
('func_1', 'FUNC001', 'Carlos Vendedor', 'Funcionário', '123.456.789-00', 'carlos@empresa.com', '11999990001', 'Vendedor', 5.00, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Fornecedor exemplo
INSERT INTO pessoas (id, code, name, fantasy_name, type, legal_type, document, email, phone, contact_name, payment_terms, active) VALUES
('forn_1', 'FORN001', 'Distribuidora ABC Ltda', 'ABC Distribuidora', 'Fornecedor', 'PJ', '12.345.678/0001-90', 'vendas@abc.com', '1133334444', 'José Contato', '30/60/90 dias', TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);

SELECT 'Migration executada com sucesso!' AS status;
