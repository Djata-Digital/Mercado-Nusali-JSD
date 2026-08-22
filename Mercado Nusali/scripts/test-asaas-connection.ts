import 'dotenv/config';
import { getAsaasConfig } from '../src/server/modules/payments/config/asaasConfig.js';
import { AsaasClient } from '../src/server/modules/payments/clients/asaasClient.js';

async function testAsaasConnection() {
  console.log('====================================================');
  console.log('ASAAS SANDBOX CONNECTION TEST');
  console.log('====================================================\n');

  const config = getAsaasConfig();

  if (!config.apiKey || !config.apiKey.trim()) {
    console.error('❌ ASAAS_NOT_CONFIGURED: ASAAS_API_KEY não está configurada no arquivo .env.');
    console.error('   Insira uma ASAAS_API_KEY válida no seu arquivo .env local para testar a conexão real com a Sandbox.\n');
    process.exit(1);
  }

  console.log(`- Ambiente: ${config.environment}`);
  console.log(`- Base URL: ${config.baseUrl}`);
  console.log(`- User-Agent: ${config.userAgent}`);
  console.log(`- Endpoint de Teste: GET ${config.baseUrl}/myAccount/status/`);
  console.log('- Autenticação: Header access_token (***REDACTED***)\n');

  try {
    const statusInfo = await AsaasClient.request<any>('/myAccount/status/', { method: 'GET' });

    console.log('====================================================');
    console.log('ASAAS SANDBOX CONNECTION: OK');
    console.log('====================================================');
    console.log(`- General status: ${statusInfo?.general ?? null}`);
    console.log(`- Commercial info: ${statusInfo?.commercialInfo ?? null}`);
    console.log(`- Documentation: ${statusInfo?.documentation ?? null}\n`);
  } catch (err: any) {
    console.error('====================================================');
    console.error('❌ ASAAS SANDBOX CONNECTION: FAILED');
    console.error('====================================================');
    console.error(`- Código de Erro: ${err.code || 'ASAAS_CONNECTION_ERROR'}`);
    console.error(`- Mensagem: ${err.message}\n`);
    process.exit(1);
  }
}

testAsaasConnection();
