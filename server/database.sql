-- Script de criação do banco de dados MySQL
-- Execute este script no seu MySQL antes de iniciar o servidor

CREATE DATABASE IF NOT EXISTS gestao_comercial CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gestao_comercial;

-- Tabela de Pessoas (Clientes e Fornecedores)
CREATE TABLE IF NOT EXISTS pessoas (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  fantasy_name VARCHAR(255),
  legal_type ENUM('PF', 'PJ') DEFAULT 'PF',
  type ENUM('Cliente', 'Fornecedor', 'Funcionário') NOT NULL DEFAULT 'Cliente',
  document VARCHAR(50),
  rg_ie VARCHAR(50),
  birth_date DATE,
  gender ENUM('M', 'F', 'O'),
  email VARCHAR(255),
  phone VARCHAR(50),
  phone2 VARCHAR(50),
  cep VARCHAR(10),
  street VARCHAR(255),
  number VARCHAR(20),
  complement VARCHAR(100),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(2),
  reference VARCHAR(255),
  address TEXT,
  notes TEXT,
  photo LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_name (name),
  INDEX idx_type (type),
  INDEX idx_document (document),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS produtos (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  unit VARCHAR(10) DEFAULT 'UN',
  short_description VARCHAR(100),
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  cost DECIMAL(10, 2) DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT DEFAULT 0,
  category VARCHAR(100),
  sub_category VARCHAR(100),
  brand VARCHAR(100),
  description TEXT,
  barcode VARCHAR(100),
  photo LONGTEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_name (name),
  INDEX idx_sku (sku),
  INDEX idx_category (category),
  INDEX idx_brand (brand),
  INDEX idx_barcode (barcode),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Transações (Movimentos Financeiros)
CREATE TABLE IF NOT EXISTS transacoes (
  id VARCHAR(36) PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  due_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  person VARCHAR(255) NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  value_due DECIMAL(10, 2) NOT NULL,
  paid BOOLEAN DEFAULT FALSE,
  status ENUM('pago', 'pendente', 'vencido') NOT NULL DEFAULT 'pendente',
  payment_date DATE,
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_due_date (due_date),
  INDEX idx_person (person),
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_paid (paid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Vendas (PDV)
CREATE TABLE IF NOT EXISTS vendas (
  id VARCHAR(36) PRIMARY KEY,
  client_name VARCHAR(255),
  client_phone VARCHAR(50),
  client_email VARCHAR(255),
  subtotal DECIMAL(10, 2) NOT NULL,
  discount DECIMAL(10, 2) DEFAULT 0.00,
  total DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  amount_paid DECIMAL(10, 2),
  change_amount DECIMAL(10, 2),
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sale_date (sale_date),
  INDEX idx_client_name (client_name),
  INDEX idx_payment_method (payment_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Itens da Venda
CREATE TABLE IF NOT EXISTS vendas_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36),
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES vendas(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES produtos(id) ON DELETE SET NULL,
  INDEX idx_sale_id (sale_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Agenda/Compromissos
CREATE TABLE IF NOT EXISTS agenda (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  all_day BOOLEAN DEFAULT FALSE,
  location VARCHAR(255),
  person_id VARCHAR(36),
  color VARCHAR(20) DEFAULT '#3788d8',
  reminder_minutes INT,
  status ENUM('agendado', 'concluído', 'cancelado') DEFAULT 'agendado',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES pessoas(id) ON DELETE SET NULL,
  INDEX idx_start_date (start_date),
  INDEX idx_status (status),
  INDEX idx_person_id (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir dados de exemplo
INSERT INTO pessoas (id, name, email, phone, type) VALUES
('p_1', 'João Silva', 'joao@example.com', '1199999-0001', 'Cliente'),
('p_2', 'Loja Exemplo', 'contato@loja.com', '1133333-4444', 'Fornecedor'),
('p_3', 'Maria Santos', 'maria@example.com', '1188888-0002', 'Cliente');

INSERT INTO produtos (id, name, sku, price, cost, stock, category) VALUES
('prod_1', 'Camiseta Polo', 'CP-001', 49.90, 25.00, 12, 'Produtos'),
('prod_2', 'Caneca', 'CN-001', 19.50, 8.00, 40, 'Produtos'),
('prod_3', 'Caderno', 'CD-001', 15.00, 6.50, 25, 'Produtos'),
('prod_4', 'Mochila', 'MC-001', 89.90, 45.00, 8, 'Produtos');

INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status) VALUES
('1', 'Vendas', '2018-04-14', 'VENDA Nº 35', 'João Marcio Rodrigues', 20.00, 20.00, FALSE, 'vencido'),
('2', 'Vendas', '2018-04-17', 'NOTA DE SERVIÇO Nº 1', 'João Marcio Rodrigues', 50.00, 50.00, FALSE, 'vencido'),
('3', 'Aluguel', '2018-04-18', 'JAILSON', 'LUIZA', -5.00, 0.00, TRUE, 'pago'),
('4', 'Vendas', '2018-04-18', 'VENDA Nº 110', 'Matheus Silva', 15.00, 0.00, TRUE, 'pago'),
('5', 'Vendas', '2018-04-18', 'VENDA Nº 111', 'João Marcio Rodrigues', 95.97, 0.00, TRUE, 'pago'),
('6', 'Vendas', '2018-04-18', 'VENDA Nº 114', 'João Marcio Rodrigues', 87.91, 0.00, TRUE, 'pago'),
('7', 'Vendas', '2018-04-18', 'VENDA Nº 115', 'Matheus Silva', 56.92, 0.00, TRUE, 'pago'),
('8', 'Vendas', '2018-04-18', 'VENDA Nº 116', 'Matheus Silva', 67.76, 0.00, TRUE, 'pago'),
('9', 'Vendas', '2018-04-18', 'VENDA Nº 117', 'Matheus Primon', 190.00, 190.00, FALSE, 'vencido'),
('10', 'Pró labore', '2018-04-19', '111111', 'Bianca Paula', 1111.00, 0.00, TRUE, 'pago');

-- Exibir resumo
SELECT 'Banco de dados criado com sucesso!' AS status;
SELECT COUNT(*) AS total_pessoas FROM pessoas;
SELECT COUNT(*) AS total_produtos FROM produtos;
SELECT COUNT(*) AS total_transacoes FROM transacoes;
