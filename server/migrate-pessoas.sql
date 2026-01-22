-- Script de migração para adicionar novos campos na tabela pessoas
-- Execute este script no MySQL para atualizar a estrutura sem perder dados existentes

USE gestao_comercial;

-- Adicionar novas colunas
ALTER TABLE pessoas 
ADD COLUMN IF NOT EXISTS code VARCHAR(50) AFTER id,
ADD COLUMN IF NOT EXISTS fantasy_name VARCHAR(255) AFTER name,
ADD COLUMN IF NOT EXISTS legal_type ENUM('PF', 'PJ') DEFAULT 'PF' AFTER fantasy_name,
ADD COLUMN IF NOT EXISTS rg_ie VARCHAR(50) AFTER document,
ADD COLUMN IF NOT EXISTS birth_date DATE AFTER rg_ie,
ADD COLUMN IF NOT EXISTS gender ENUM('M', 'F', 'O') AFTER birth_date,
ADD COLUMN IF NOT EXISTS phone2 VARCHAR(50) AFTER phone,
ADD COLUMN IF NOT EXISTS cep VARCHAR(10) AFTER phone2,
ADD COLUMN IF NOT EXISTS street VARCHAR(255) AFTER cep,
ADD COLUMN IF NOT EXISTS number VARCHAR(20) AFTER street,
ADD COLUMN IF NOT EXISTS complement VARCHAR(100) AFTER number,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) AFTER complement,
ADD COLUMN IF NOT EXISTS city VARCHAR(100) AFTER neighborhood,
ADD COLUMN IF NOT EXISTS state VARCHAR(2) AFTER city,
ADD COLUMN IF NOT EXISTS reference VARCHAR(255) AFTER state,
ADD COLUMN IF NOT EXISTS photo LONGTEXT AFTER notes;

-- Modificar coluna type para incluir 'Funcionário'
ALTER TABLE pessoas 
MODIFY COLUMN type ENUM('Cliente', 'Fornecedor', 'Funcionário') NOT NULL DEFAULT 'Cliente';

-- Adicionar índices para melhor performance
ALTER TABLE pessoas
ADD INDEX IF NOT EXISTS idx_code (code),
ADD INDEX IF NOT EXISTS idx_document (document);

-- Atualizar código sequencial para registros existentes (apenas se code estiver vazio)
SET @counter = 0;
UPDATE pessoas 
SET code = (@counter := @counter + 1)
WHERE code IS NULL OR code = '';

SELECT 'Migração concluída com sucesso!' AS status;
