$base = 'http://localhost:3000'
Write-Output '--- PRODUCTS ---'
try{
  $prod = Invoke-RestMethod -Uri ($base + '/api/products') -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{name='Teste Produto'; sku='TST-123'; price=9.9; stock=5; category='Teste'})
  Write-Output "Created product id: $($prod.id)"
  $upd = Invoke-RestMethod -Uri ($base + '/api/products/' + $prod.id) -Method Put -ContentType 'application/json' -Body (ConvertTo-Json @{price=12.5; stock=10})
  Write-Output "Updated product price: $($upd.price)"
  Invoke-RestMethod -Uri ($base + '/api/products/' + $prod.id) -Method Delete
  Write-Output 'Deleted product'

  Write-Output '--- PEOPLE ---'
  $person = Invoke-RestMethod -Uri ($base + '/api/people') -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{name='Teste Pessoa'; email='teste@ex.com'; phone='0000-0000'; type='Cliente'})
  Write-Output "Created person id: $($person.id)"
  $upp = Invoke-RestMethod -Uri ($base + '/api/people/' + $person.id) -Method Put -ContentType 'application/json' -Body (ConvertTo-Json @{phone='1111-2222'})
  Write-Output "Updated person phone: $($upp.phone)"
  Invoke-RestMethod -Uri ($base + '/api/people/' + $person.id) -Method Delete
  Write-Output 'Deleted person'

  Write-Output '--- TRANSACTIONS ---'
  $tx = Invoke-RestMethod -Uri ($base + '/api/transactions') -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{category='Teste'; dueDate='2026-01-18'; description='Lançamento teste'; person='Pessoa X'; value=100; valueDue=100; paid=$false; status='vencido'})
  Write-Output "Created tx id: $($tx.id)"
  $uptx = Invoke-RestMethod -Uri ($base + '/api/transactions/' + $tx.id) -Method Put -ContentType 'application/json' -Body (ConvertTo-Json @{paid=$true; status='pago'})
  Write-Output "Updated tx paid: $($uptx.paid)"
  Invoke-RestMethod -Uri ($base + '/api/transactions/' + $tx.id) -Method Delete
  Write-Output 'Deleted tx'

  Write-Output 'All tests completed successfully'
  exit 0
}catch{
  Write-Error $_
  exit 2
}
