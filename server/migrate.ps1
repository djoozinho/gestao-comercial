# Script PowerShell para executar a migração do banco de dados
# Este script adiciona as novas colunas na tabela pessoas

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Migração da Tabela Pessoas" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se o MySQL está instalado
$mysqlPath = "mysql"
try {
    $null = Get-Command $mysqlPath -ErrorAction Stop
} catch {
    Write-Host "ERRO: MySQL não encontrado no PATH do sistema." -ForegroundColor Red
    Write-Host "Instale o MySQL ou adicione-o ao PATH do Windows." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternativamente, execute manualmente:" -ForegroundColor Yellow
    Write-Host "mysql -u root -p < server/migrate-pessoas.sql" -ForegroundColor White
    exit 1
}

# Solicitar senha do MySQL
Write-Host "Digite a senha do MySQL (root):" -ForegroundColor Yellow
Write-Host "(Pressione ENTER se não tiver senha)" -ForegroundColor Gray
$plainPassword = Read-Host 

Write-Host ""
Write-Host "Executando migração..." -ForegroundColor Yellow

# Executar a migração
$migrationFile = "server\migrate-pessoas.sql"
if ($plainPassword -eq "") {
    Get-Content $migrationFile | mysql -u root
} else {
    Get-Content $migrationFile | mysql -u root -p"$plainPassword"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Migração executada com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "As novas colunas foram adicionadas:" -ForegroundColor Cyan
    Write-Host "  • code (Código interno)" -ForegroundColor White
    Write-Host "  • fantasy_name (Nome fantasia)" -ForegroundColor White
    Write-Host "  • legal_type (Tipo de pessoa: PF/PJ)" -ForegroundColor White
    Write-Host "  • rg_ie (RG ou Inscrição Estadual)" -ForegroundColor White
    Write-Host "  • birth_date (Data de nascimento)" -ForegroundColor White
    Write-Host "  • gender (Sexo)" -ForegroundColor White
    Write-Host "  • phone2 (Telefone secundário)" -ForegroundColor White
    Write-Host "  • cep, street, number, complement" -ForegroundColor White
    Write-Host "  • neighborhood, city, state, reference" -ForegroundColor White
    Write-Host "  • photo (Foto em base64)" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Erro ao executar migração!" -ForegroundColor Red
    Write-Host "Verifique se o MySQL está rodando e se as credenciais estão corretas." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
