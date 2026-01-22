Como ativar a impressão local para Elgin i8

O projeto agora inclui um serviço simples que tenta enviar os arquivos de cupom para uma impressora local (Windows / lpr).

Passos:

1) Ativar impressão automática (opcional):
   - Defina a variável de ambiente `ELGIN_PRINT_ENABLED=1` no ambiente onde o servidor roda.
   - Opcional: defina `ELGIN_PRINTER_NAME="Nome da impressora"` para direcionar para uma impressora específica no sistema.

2) Como funciona:
   - O endpoint `/api/print/elgin` grava o cupom em `printouts/elgin-<timestamp>.txt` e, se `ELGIN_PRINT_ENABLED=1` ou se o payload incluir `autoPrint: true`, tenta enviá-lo diretamente à impressora local.
   - No Windows, a tentativa usa `PowerShell Out-Printer` (recomendado) e, se falhar, tenta `notepad /p` como fallback.
   - Em sistemas UNIX, a chamada usa `lpr`.

3) Notas importantes:
   - Para impressões ESC/POS (raw) / comportamentos específicos do modelo Elgin i8, instale as dependências: `npm install escpos usb` (em Windows pode ser necessário instalar libusb e drivers). Depois defina `ELGIN_ESC_POS=1` para habilitar ESC/POS.
   - Exemplos de variáveis de ambiente úteis:
     - `ELGIN_PRINT_ENABLED=1` — habilita fallback de impressão (texto).
     - `ELGIN_ESC_POS=1` — ativa o uso de ESC/POS via `escpos` quando `device: 'elgin-i8'`.
     - `ELGIN_PRINTER_NAME="Nome da impressora"` — nome da impressora no sistema (usado pelo fallback `print-service`).
     - `ELGIN_USB_VID_PID="04b8:0e15"` — opcional, vendor:product hex para USB (usado pelo módulo ESC/POS).
   - Teste manualmente com texto (fallback):
     `curl -X POST http://localhost:3000/api/print/elgin -H "Content-Type: application/json" -d "{ \"coupon\": \"Texto do cupom\", \"autoPrint\": true }"`
   - Teste ESC/POS (se `escpos` instalado):
     `curl -X POST http://localhost:3000/api/print/elgin -H "Content-Type: application/json" -d "{ \"coupon\": \"Texto do cupom\", \"device\": \"elgin-i8\", \"escpos\": true, \"autoPrint\": true }"`

Se quiser, eu posso: 1) implementar envio ESC/POS com reconciliação de erros/alertas, 2) criar um serviço Windows (daemon) para escutar requisições e imprimir com mais robustez, ou 3) adicionar um botão no modal para "Imprimir automaticamente" com persistência. Diga qual prefere.