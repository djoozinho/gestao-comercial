const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Caminho para o arquivo JSON de empresas
const EMPRESAS_FILE = path.join(__dirname, 'data', 'empresas.json');

// Garantir que o diretório data existe
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir);
  }
  
  // Verificar se o arquivo existe
  try {
    await fs.access(EMPRESAS_FILE);
  } catch {
    // Criar arquivo com array vazio
    await fs.writeFile(EMPRESAS_FILE, JSON.stringify([], null, 2));
  }
}

// Ler empresas do arquivo
async function readEmpresas() {
  try {
    const data = await fs.readFile(EMPRESAS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler empresas:', error);
    return [];
  }
}

// Escrever empresas no arquivo
async function writeEmpresas(empresas) {
  try {
    await fs.writeFile(EMPRESAS_FILE, JSON.stringify(empresas, null, 2));
  } catch (error) {
    console.error('Erro ao escrever empresas:', error);
  }
}

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor rodando' });
});

// GET todas as empresas
app.get('/api/empresas', async (req, res) => {
  try {
    const empresas = await readEmpresas();
    res.json(empresas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar empresas' });
  }
});

// GET empresa por ID
app.get('/api/empresas/:id', async (req, res) => {
  try {
    const empresas = await readEmpresas();
    const empresa = empresas.find(e => e.id == req.params.id);
    
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar empresa' });
  }
});

// POST criar nova empresa
app.post('/api/empresas', async (req, res) => {
  try {
    const empresas = await readEmpresas();
    const novaEmpresa = {
      id: Date.now(), // ID simples baseado em timestamp
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    empresas.push(novaEmpresa);
    await writeEmpresas(empresas);
    
    res.status(201).json(novaEmpresa);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar empresa' });
  }
});

// PUT atualizar empresa
app.put('/api/empresas/:id', async (req, res) => {
  try {
    const empresas = await readEmpresas();
    const index = empresas.findIndex(e => e.id == req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    
    empresas[index] = {
      ...empresas[index],
      ...req.body,
      updated_at: new Date().toISOString()
    };
    
    await writeEmpresas(empresas);
    res.json(empresas[index]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar empresa' });
  }
});

// DELETE empresa
app.delete('/api/empresas/:id', async (req, res) => {
  try {
    const empresas = await readEmpresas();
    const filtered = empresas.filter(e => e.id != req.params.id);
    
    if (filtered.length === empresas.length) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    
    await writeEmpresas(filtered);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir empresa' });
  }
});

// Inicializar servidor
async function startServer() {
  await ensureDataDir();
  
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
  });
}

startServer();
