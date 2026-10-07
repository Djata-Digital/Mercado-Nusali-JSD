import type { LegalSection } from './legalTypes';
import { LEGAL_TERMS_PATH } from './legalTypes';

export const PRIVACY_INTRO =
  'Esta Política de Privacidade explica como o Mercado Nusali trata dados pessoais quando você navega, cria uma conta ou usa a plataforma disponível em mercado.nusali.com.';

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'quem-somos',
    title: '1. Quem trata os seus dados',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali, plataforma de marketplace integrante do ecossistema NUSALI, é o responsável pelo tratamento dos dados pessoais descritos nesta Política no âmbito da plataforma.',
      },
      {
        type: 'p',
        text: `Os dados cadastrais completos da entidade responsável serão informados nesta página na versão definitiva da Política. Ela deve ser lida em conjunto com os {{${LEGAL_TERMS_PATH}|Termos de Uso}}.`,
      },
    ],
  },
  {
    id: 'dados-tratados',
    title: '2. Quais dados são tratados',
    blocks: [
      { type: 'p', text: 'Tratamos apenas os dados necessários ao funcionamento da plataforma, conforme o uso que você faz dela:' },
      {
        type: 'ul',
        items: [
          'Cadastro e conta: nome completo, e-mail, telefone, país, tipo de conta (comprador ou vendedor), senha (armazenada somente em forma de hash irreversível) e o estado de verificação do e-mail.',
          'Perfil e preferências: foto de perfil, quando você a envia; moeda, idioma e país de exibição preferidos; endereços cadastrados (destinatário, endereço e telefone), quando você os informa.',
          'Vendedores: nome ou razão social, nome comercial, identificação fiscal quando informada, telefone, país, dados da loja (nome, descrição, imagens, categoria, informações de contato e horários), produtos e estoque e, se você os cadastrar, dados de recebimento como conta bancária.',
          'Verificação de vendedores (KYC): tipo e número do documento, nome legal, imagem do documento de identidade, comprovante de residência, selfie de validação e, para empresas, documento de registro empresarial, além do resultado da análise e do motivo de eventual rejeição.',
          'Dados técnicos e de segurança: endereço IP, tipo de navegador e dispositivo (user agent), data e hora de acesso, sessões de login e registros de segurança e de auditoria de ações administrativas.',
          'Registro de aceite: as versões dos Termos de Uso e da Política de Privacidade que você aceitou, a data e a hora do aceite e a sua escolha, opcional, sobre receber novidades e comunicações do Mercado Nusali.',
          'Comunicações do serviço: e-mails enviados pela plataforma, como o código de verificação de e-mail e o link de redefinição de senha.',
          'Conteúdo que você envia: anúncios, textos e imagens de lojas e produtos e, quando esses recursos estiverem disponíveis, perguntas, respostas e avaliações.',
        ],
      },
      {
        type: 'p',
        text: 'Se e quando compras e pagamentos forem disponibilizados, passaremos a tratar também dados de pedidos, pagamento e entrega, e esta Política será atualizada antes disso.',
      },
      {
        type: 'p',
        text: 'Informações de lojas e produtos que o vendedor publica (como nome da loja, descrição, imagens, contatos e produtos) são públicas, visíveis a qualquer visitante e podem ser exibidas em mecanismos de busca.',
      },
    ],
  },
  {
    id: 'finalidades',
    title: '3. Para que usamos os dados',
    blocks: [
      {
        type: 'ul',
        items: [
          'Cadastro e autenticação: criar e manter sua conta, verificar seu e-mail, permitir o login, manter a sessão e recuperar o acesso à conta.',
          'Operação do marketplace: exibir lojas, categorias e produtos; permitir que vendedores administrem lojas e anúncios; oferecer recursos da conta como favoritos, carrinho, endereços e perfil.',
          'Verificação de vendedores (KYC): confirmar a identidade de quem deseja vender antes de liberar a criação de lojas e produtos.',
          'Segurança e prevenção de fraude: limitar tentativas de acesso, detectar usos indevidos, proteger contas e manter registros de auditoria.',
          'Comunicação: enviar mensagens necessárias ao serviço, como códigos de verificação, redefinição de senha e avisos sobre a conta.',
          'Obrigações legais e exercício de direitos: cumprir exigências legais ou regulatórias e defender direitos em processos.',
          'Manutenção e melhoria da plataforma: diagnosticar falhas e manter o funcionamento técnico.',
        ],
      },
      {
        type: 'p',
        text: 'No cadastro, você pode indicar, de forma opcional, que deseja receber novidades e comunicações do Mercado Nusali. Essa escolha não é necessária para criar a conta nem para usar a plataforma, vem desmarcada por padrão e comunicações promocionais, quando existirem, dependerão dela. Não comercializamos dados pessoais.',
      },
      {
        type: 'p',
        text: 'Conforme a lei aplicável, o tratamento pode se basear na execução do contrato de uso da plataforma, no cumprimento de obrigação legal, no legítimo interesse (por exemplo, segurança e prevenção de fraude) ou no seu consentimento, quando exigido.',
      },
    ],
  },
  {
    id: 'compartilhamento',
    title: '4. Com quem os dados são compartilhados',
    blocks: [
      {
        type: 'p',
        text: 'Compartilhamos dados apenas na medida necessária ao funcionamento da plataforma, com:',
      },
      {
        type: 'ul',
        items: [
          'Prestadores de infraestrutura: hospedagem do serviço (Render), rede de entrega e proteção do tráfego e armazenamento de arquivos (Cloudflare e Cloudflare R2), banco de dados gerenciado e serviço de cache e controle de limites de acesso.',
          'Prestador de envio de e-mails transacionais (Resend), que recebe o endereço de e-mail e o conteúdo da mensagem enviada (como o código de verificação).',
          'Recurso opcional de inteligência artificial: o painel do vendedor possui um recurso de geração de texto por IA (modelos Google Gemini). Quando o vendedor aciona esse recurso e o serviço está habilitado, os dados do produto preenchidos no formulário são enviados ao prestador para gerar o texto.',
          'Serviços externos consultados pelo seu navegador: taxas de câmbio, para exibir valores convertidos, e imagens ilustrativas de um servidor externo na etapa de escolha de avatar do cadastro. Nessas consultas, o serviço externo pode receber seu endereço IP e dados técnicos do navegador.',
          'Autoridades públicas, quando houver obrigação legal ou ordem de autoridade competente.',
          'Terceiros envolvidos em eventual reorganização da operação, desde que a proteção dos dados seja mantida.',
        ],
      },
      {
        type: 'p',
        text: 'Os documentos de KYC podem ser consultados pelo próprio vendedor e pela equipe administrativa responsável pela análise, e não são exibidos publicamente.',
      },
    ],
  },
  {
    id: 'cookies-armazenamento',
    title: '5. Cookies, armazenamento local e sessões',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali não define cookies próprios e, nesta versão, não usa cookies de publicidade nem ferramentas de análise de terceiros incorporadas ao site.',
      },
      {
        type: 'p',
        text: 'Usamos o armazenamento local do navegador (localStorage e sessionStorage) para:',
      },
      {
        type: 'ul',
        items: [
          'manter sua sessão: credenciais de acesso e de renovação e dados básicos da conta;',
          'guardar o carrinho e os favoritos;',
          'lembrar preferências de país, moeda e tema, e um cache de taxas de câmbio;',
          'guardar, durante a verificação, o e-mail que aguarda confirmação.',
        ],
      },
      {
        type: 'p',
        text: 'Esses dados ficam no seu dispositivo. Ao sair da conta, as credenciais armazenadas são removidas, e você pode limpar o armazenamento do navegador a qualquer momento, o que encerra a sessão. Na área de Segurança você pode ver e encerrar suas sessões ativas. Prestadores de infraestrutura, como a rede de entrega e proteção, podem usar mecanismos técnicos próprios de segurança e funcionamento, conforme as suas políticas.',
      },
    ],
  },
  {
    id: 'armazenamento-seguranca',
    title: '6. Armazenamento e segurança',
    blocks: [
      {
        type: 'p',
        text: 'Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados, entre elas:',
      },
      {
        type: 'ul',
        items: [
          'senhas armazenadas apenas em forma de hash; códigos e tokens temporários guardados em forma protegida e com validade curta;',
          'comunicação com a plataforma por conexão criptografada (HTTPS);',
          'limites de tentativas em cadastro, login, verificação e recuperação de senha;',
          'documentos de KYC guardados em armazenamento privado, de acesso restrito e consultados por meio de links temporários;',
          'registros de auditoria de ações administrativas.',
        ],
      },
      {
        type: 'p',
        text: 'Nenhum sistema é totalmente imune a falhas ou acessos indevidos. Em caso de incidente relevante, adotaremos as medidas e as comunicações exigidas pela lei aplicável.',
      },
    ],
  },
  {
    id: 'retencao',
    title: '7. Por quanto tempo guardamos os dados',
    blocks: [
      {
        type: 'p',
        text: 'Mantemos os dados pelo tempo necessário para as finalidades descritas nesta Política, para cumprir obrigações legais ou regulatórias, prevenir fraudes e resolver disputas. Códigos de verificação e links de redefinição de senha têm validade curta, e as sessões expiram automaticamente.',
      },
      {
        type: 'p',
        text: 'Os prazos específicos de retenção por categoria de dado serão detalhados na versão definitiva desta Política. Quando os dados deixarem de ser necessários, serão eliminados ou anonimizados, salvo se a lei exigir a sua guarda.',
      },
    ],
  },
  {
    id: 'direitos',
    title: '8. Seus direitos',
    blocks: [
      {
        type: 'p',
        text: 'Conforme a lei aplicável ao seu caso, você pode ter direito de:',
      },
      {
        type: 'ul',
        items: [
          'confirmar se tratamos seus dados e acessá-los;',
          'corrigir dados incompletos, inexatos ou desatualizados;',
          'solicitar a eliminação, o bloqueio ou a anonimização de dados, quando cabível;',
          'solicitar a portabilidade dos dados, quando aplicável;',
          'obter informações sobre o compartilhamento dos seus dados;',
          'retirar o consentimento, quando o tratamento se basear nele, e se opor a determinados tratamentos;',
          'reclamar à autoridade de proteção de dados competente.',
        ],
      },
      {
        type: 'p',
        text: 'Alguns direitos podem ser limitados por obrigações legais ou pela necessidade de prevenir fraudes e proteger terceiros. Você já pode consultar e atualizar parte dos seus dados na área de Perfil e gerenciar senha e sessões na área de Segurança. O canal oficial para solicitações de privacidade está em definição (veja a seção 11).',
      },
    ],
  },
  {
    id: 'menores',
    title: '9. Dados de menores de idade',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali não é destinado a menores de idade. Se identificarmos uma conta de menor sem a representação ou autorização exigida pela lei aplicável, poderemos suspendê-la e eliminar os dados correspondentes, conforme a lei.',
      },
    ],
  },
  {
    id: 'transferencias',
    title: '10. Transferências internacionais',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali é acessado a partir de diferentes países e conta com prestadores de infraestrutura que podem tratar e armazenar dados em servidores localizados fora do país do usuário. Quando a lei aplicável exigir, adotaremos as medidas necessárias para que essas transferências ocorram com proteção adequada.',
      },
    ],
  },
  {
    id: 'contato',
    title: '11. Contato e alterações desta Política',
    blocks: [
      {
        type: 'p',
        text: 'O canal oficial para dúvidas e solicitações de privacidade, incluindo o encarregado ou responsável por proteção de dados, quando exigido, está em definição e será divulgado nesta página e na {{/help-center|Central de Ajuda}}.',
      },
      {
        type: 'p',
        text: 'Podemos atualizar esta Política. A versão vigente e a data da última atualização aparecem no topo desta página, e mudanças relevantes poderão ser comunicadas na plataforma ou por e-mail, quando apropriado.',
      },
    ],
  },
];
