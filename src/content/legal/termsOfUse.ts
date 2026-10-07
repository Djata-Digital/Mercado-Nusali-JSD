import type { LegalSection } from './legalTypes';
import { LEGAL_PRIVACY_PATH } from './legalTypes';

export const TERMS_INTRO =
  'Estes Termos de Uso regulam o acesso e a utilização do Mercado Nusali, disponível em mercado.nusali.com. Leia com atenção antes de criar uma conta ou de usar a plataforma.';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'apresentacao',
    title: '1. Apresentação do Mercado Nusali',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali é uma plataforma de marketplace online que conecta vendedores e compradores e integra o ecossistema NUSALI. Nela, vendedores aprovados podem criar lojas e anunciar produtos, e visitantes e compradores podem explorar categorias, lojas e produtos.',
      },
      {
        type: 'p',
        text: 'O Mercado Nusali atua como plataforma tecnológica de intermediação: os produtos são anunciados e oferecidos pelos próprios vendedores, que respondem pelos seus anúncios, preços e pela relação com o comprador, nos limites da lei aplicável.',
      },
      {
        type: 'p',
        text: 'Os dados cadastrais completos da entidade responsável pela operação do Mercado Nusali serão informados nesta página na versão definitiva destes Termos.',
      },
    ],
  },
  {
    id: 'aceitacao',
    title: '2. Aceitação dos Termos',
    blocks: [
      {
        type: 'p',
        text: `Ao criar uma conta, marcar a caixa de aceite no cadastro ou utilizar a plataforma, você declara que leu e concorda com estes Termos e com a {{${LEGAL_PRIVACY_PATH}|Política de Privacidade}}. Se não concordar, não utilize a plataforma.`,
      },
      {
        type: 'p',
        text: 'A navegação por páginas públicas, como categorias, lojas e produtos, não exige cadastro, mas também está sujeita a estes Termos.',
      },
    ],
  },
  {
    id: 'elegibilidade-cadastro',
    title: '3. Elegibilidade e cadastro',
    blocks: [
      {
        type: 'p',
        text: 'Para criar uma conta, você deve ter capacidade legal para contratar segundo a lei aplicável (em regra, ser maior de idade) ou estar devidamente representado por seu responsável legal.',
      },
      {
        type: 'p',
        text: 'O cadastro exige informar dados verdadeiros e atualizados: nome, e-mail, telefone, país e senha. O país deve estar entre os disponíveis no formulário de cadastro.',
      },
      {
        type: 'ul',
        items: [
          'Após o cadastro, você deve confirmar seu e-mail com o código de verificação enviado. Contas com e-mail não verificado não acessam as áreas autenticadas.',
          'O cadastro público permite criar contas de comprador e de vendedor. Contas de natureza administrativa ou interna não são criadas por cadastro público.',
          'É proibido criar contas com informações falsas, em nome de terceiros sem autorização ou para finalidades fraudulentas.',
        ],
      },
    ],
  },
  {
    id: 'conta-seguranca',
    title: '4. Sua conta e a responsabilidade pelo acesso',
    blocks: [
      {
        type: 'p',
        text: 'Suas credenciais são pessoais. Não as compartilhe e use uma senha forte e exclusiva. Você é responsável pelas atividades realizadas com a sua conta, salvo se comprovar que houve uso indevido que não decorreu de sua conduta.',
      },
      {
        type: 'ul',
        items: [
          'Na área de Segurança da sua conta você pode alterar a senha e encerrar sessões ativas em outros dispositivos.',
          'Se suspeitar de uso indevido da sua conta, altere a senha, encerre as demais sessões e informe o Mercado Nusali assim que possível pelos canais de atendimento disponíveis.',
          'Podemos aplicar limites de tentativas de acesso e outras medidas técnicas de proteção das contas.',
        ],
      },
    ],
  },
  {
    id: 'compradores',
    title: '5. Compradores e a fase atual de compras',
    blocks: [
      {
        type: 'p',
        text: 'Compradores podem criar conta, navegar por categorias, lojas e produtos e utilizar os recursos da conta que estejam disponíveis, como favoritos, carrinho, endereços e perfil.',
      },
      {
        type: 'p',
        text: 'Neste momento, a finalização de compras, os meios de pagamento e as opções de entrega ainda não estão liberados para uso público no Mercado Nusali. Itens colocados no carrinho não representam compra concluída, reserva de produto nem oferta firme de venda.',
      },
      {
        type: 'p',
        text: 'Quando a compra e o pagamento forem disponibilizados, divulgaremos as condições aplicáveis (meios de pagamento, prazos, entrega, trocas e devoluções) e, se necessário, atualizaremos estes Termos. Nenhuma funcionalidade futura deve ser presumida enquanto não estiver efetivamente disponível.',
      },
      {
        type: 'p',
        text: 'O comprador deve ler a descrição, o preço e as condições de cada anúncio e usar a plataforma de boa-fé.',
      },
    ],
  },
  {
    id: 'vendedores',
    title: '6. Vendedores',
    blocks: [
      {
        type: 'p',
        text: 'Para vender, é necessário cadastrar-se como vendedor, concluir a verificação de identidade (KYC) descrita na seção 13 e ser aprovado pelo Mercado Nusali. Enquanto a verificação não for aprovada, o vendedor não pode criar lojas nem cadastrar produtos.',
      },
      {
        type: 'p',
        text: 'O vendedor é responsável por:',
      },
      {
        type: 'ul',
        items: [
          'a veracidade das informações do seu cadastro, da sua loja e dos seus anúncios;',
          'cumprir a legislação aplicável à sua atividade, incluindo, quando houver, obrigações fiscais, comerciais e de proteção do consumidor;',
          'possuir os direitos necessários sobre os produtos, marcas, textos e imagens que anuncia;',
          'manter atualizados seus dados de contato, preços e estoque.',
        ],
      },
      {
        type: 'p',
        text: 'Comissões, repasses e demais condições financeiras entre o Mercado Nusali e os vendedores serão informadas antes de serem aplicadas e dependem da disponibilização das funcionalidades de venda e pagamento.',
      },
    ],
  },
  {
    id: 'lojas',
    title: '7. Criação e administração de lojas',
    blocks: [
      {
        type: 'p',
        text: 'Vendedores aprovados podem criar e administrar lojas. Cada loja está associada a um país, que define o país de origem e a moeda dos seus produtos.',
      },
      {
        type: 'p',
        text: 'Nome, descrição, logotipo, banner e informações de contato da loja são conteúdos do vendedor. Devem ser lícitos e verdadeiros, não podem induzir a erro nem imitar a identidade de outra pessoa ou marca.',
      },
      {
        type: 'p',
        text: 'O Mercado Nusali pode pausar, ocultar ou remover lojas que violem estes Termos, a lei ou direitos de terceiros, ou por razões de segurança, inclusive de forma imediata quando necessário.',
      },
    ],
  },
  {
    id: 'produtos',
    title: '8. Cadastro e responsabilidade sobre produtos',
    blocks: [
      {
        type: 'p',
        text: 'O vendedor é o responsável pelo cadastro dos seus produtos: título, descrição, categoria, imagens, preço, estoque, peso, dimensões, condição do item e demais atributos informados.',
      },
      {
        type: 'ul',
        items: [
          'Produtos publicados ficam visíveis ao público enquanto a loja e a conta do vendedor estiverem ativas. O vendedor pode pausar seus produtos quando quiser.',
          'As imagens devem representar o produto anunciado. Envie apenas conteúdo que você tem direito de usar.',
          'Informações de lojas e produtos publicados são públicas e podem ser exibidas em mecanismos de busca.',
          'O Mercado Nusali pode ocultar ou remover anúncios que violem estes Termos ou a lei.',
        ],
      },
    ],
  },
  {
    id: 'precos',
    title: '9. Preços e informações dos produtos',
    blocks: [
      {
        type: 'p',
        text: 'Os preços são definidos pelos vendedores na moeda do país da loja. A plataforma pode exibir valores convertidos para outras moedas apenas como referência, com base em taxas de câmbio obtidas de fonte externa; esses valores são aproximados e informativos.',
      },
      {
        type: 'p',
        text: 'O Mercado Nusali não verifica individualmente cada anúncio e não se responsabiliza por erros de informação inseridos pelos vendedores, sem prejuízo dos direitos assegurados por lei. Custos de frete, impostos e taxas aduaneiras, quando existirem, serão informados quando a compra estiver disponível.',
      },
    ],
  },
  {
    id: 'conteudo-proibido',
    title: '10. Conteúdo e condutas proibidas',
    blocks: [
      { type: 'p', text: 'É proibido usar o Mercado Nusali para anunciar, enviar ou praticar:' },
      {
        type: 'ul',
        items: [
          'produtos ou serviços ilegais, ou cuja venda seja proibida ou restrita pela lei aplicável;',
          'produtos falsificados, pirateados ou que violem direitos de propriedade intelectual de terceiros;',
          'anúncios fraudulentos, enganosos ou com informações falsas sobre o produto, o preço ou o vendedor;',
          'conteúdo ofensivo, discriminatório, violento, sexualmente explícito ou que viole direitos de terceiros;',
          'dados pessoais de terceiros sem autorização;',
          'códigos maliciosos, spam, tentativas de invadir, sobrecarregar ou contornar medidas de segurança e de verificação da plataforma;',
          'uso automatizado que prejudique o funcionamento da plataforma ou de outros usuários.',
        ],
      },
    ],
  },
  {
    id: 'propriedade-intelectual',
    title: '11. Propriedade intelectual',
    blocks: [
      {
        type: 'p',
        text: 'A marca Mercado Nusali, o logotipo, o software, o layout e os demais elementos da plataforma pertencem ao Mercado Nusali, ao ecossistema NUSALI ou a seus licenciantes. Você recebe apenas um direito pessoal, não exclusivo e revogável de usar a plataforma conforme estes Termos.',
      },
      {
        type: 'p',
        text: 'Os conteúdos que você envia permanecem seus. Ao enviá-los, você autoriza o Mercado Nusali, de forma não exclusiva e gratuita, a armazená-los, exibi-los e adaptá-los tecnicamente (por exemplo, redimensionar imagens) para operar e divulgar a plataforma, as lojas e os anúncios.',
      },
      {
        type: 'p',
        text: 'Se você entender que um conteúdo viola direitos seus, informe o Mercado Nusali pelos canais de atendimento disponíveis, indicando o conteúdo e a razão da denúncia.',
      },
    ],
  },
  {
    id: 'conteudo-usuarios',
    title: '12. Conteúdo enviado por usuários',
    blocks: [
      {
        type: 'p',
        text: 'Usuários podem enviar conteúdos como informações de loja, anúncios, imagens e, quando esses recursos estiverem disponíveis, perguntas, respostas e avaliações. Você responde pelo conteúdo que envia, e avaliações devem refletir experiência real.',
      },
      {
        type: 'p',
        text: 'O Mercado Nusali pode moderar, ocultar ou remover conteúdos que violem estes Termos ou a lei, sem obrigação de monitoramento prévio.',
      },
    ],
  },
  {
    id: 'kyc',
    title: '13. Verificação de vendedores (KYC)',
    blocks: [
      {
        type: 'p',
        text: 'Para liberar a criação de lojas e produtos, vendedores devem passar por verificação de identidade (KYC). Podem ser solicitados documento de identidade, comprovante de residência, selfie de validação e, no caso de empresas, documento de registro empresarial, além do nome legal e do número do documento.',
      },
      {
        type: 'ul',
        items: [
          'Os documentos são analisados pela equipe administrativa do Mercado Nusali, que pode aprovar, rejeitar ou pedir novo envio.',
          'A aprovação não constitui certificação, aval ou recomendação do vendedor nem dos seus produtos.',
          'Podemos recusar ou revogar a aprovação em caso de documentos ilegíveis, inconsistentes, falsos ou suspeitos.',
        ],
      },
      {
        type: 'p',
        text: `Veja como esses dados são tratados na {{${LEGAL_PRIVACY_PATH}|Política de Privacidade}}.`,
      },
    ],
  },
  {
    id: 'suspensao-encerramento',
    title: '14. Suspensão e encerramento de contas',
    blocks: [
      {
        type: 'p',
        text: 'Podemos suspender, restringir ou encerrar contas, lojas e anúncios, inclusive sem aviso prévio quando houver risco, em caso de violação destes Termos, suspeita de fraude, determinação legal ou inconsistência nos dados. Quando possível e adequado, informaremos o motivo.',
      },
      {
        type: 'p',
        text: 'Você pode solicitar o encerramento da sua conta pelos canais de atendimento disponíveis. Poderemos manter dados pelo período necessário nos termos da Política de Privacidade e da lei. O encerramento não afasta obrigações já assumidas.',
      },
    ],
  },
  {
    id: 'disponibilidade',
    title: '15. Fase atual, disponibilidade e responsabilidade',
    blocks: [
      {
        type: 'p',
        text: 'O Mercado Nusali está em fase de lançamento controlado. Funcionalidades podem mudar, ser limitadas, suspensas ou removidas, e a plataforma pode ficar indisponível por manutenção, falhas técnicas ou causas fora do nosso controle. Não oferecemos disponibilidade ininterrupta.',
      },
      {
        type: 'p',
        text: 'Podem existir telas, menus ou textos na plataforma que descrevam recursos ainda não disponíveis para uso público. A existência de uma tela não significa que o serviço correspondente esteja ativo.',
      },
      {
        type: 'p',
        text: 'Na medida permitida pela lei aplicável, o Mercado Nusali não responde por danos decorrentes de condutas de usuários, de informações inseridas pelos vendedores, de indisponibilidades temporárias ou de eventos fora do seu controle razoável. Nada nestes Termos limita responsabilidades que a lei não permita limitar nem retira direitos do consumidor previstos na lei aplicável.',
      },
    ],
  },
  {
    id: 'alteracoes',
    title: '16. Alterações destes Termos',
    blocks: [
      {
        type: 'p',
        text: 'Podemos atualizar estes Termos. A versão vigente e a data da última atualização aparecem no topo desta página. Mudanças relevantes poderão ser comunicadas na plataforma ou por e-mail, quando apropriado.',
      },
      {
        type: 'p',
        text: 'Se você continuar usando a plataforma após a atualização, entenderemos que concorda com a nova versão, ressalvados os direitos previstos em lei. Se não concordar, deixe de usar a plataforma e, se quiser, solicite o encerramento da conta.',
      },
    ],
  },
  {
    id: 'privacidade',
    title: '17. Privacidade',
    blocks: [
      {
        type: 'p',
        text: `O tratamento de dados pessoais no Mercado Nusali é descrito na {{${LEGAL_PRIVACY_PATH}|Política de Privacidade}}, que integra estes Termos.`,
      },
    ],
  },
  {
    id: 'contato',
    title: '18. Contato',
    blocks: [
      {
        type: 'p',
        text: 'O canal oficial para dúvidas e solicitações relacionadas a estes Termos está em definição e será divulgado nesta página e na {{/help-center|Central de Ajuda}}. Até lá, consulte a Central de Ajuda para informações gerais sobre a plataforma.',
      },
    ],
  },
  {
    id: 'legislacao',
    title: '19. Legislação aplicável',
    blocks: [
      {
        type: 'p',
        text: 'Como o Mercado Nusali pode ser acessado a partir de diferentes países, estes Termos serão interpretados de acordo com as normas aplicáveis à operação e ao usuário, incluindo, quando for o caso, as normas de proteção do consumidor e de proteção de dados pessoais do país de residência do usuário.',
      },
      {
        type: 'p',
        text: 'Nenhuma disposição destes Termos afasta direitos que a lei aplicável assegure ao usuário e que não possam ser renunciados. A indicação de foro ou de lei específica, se houver, será definida na versão definitiva destes Termos.',
      },
    ],
  },
];
