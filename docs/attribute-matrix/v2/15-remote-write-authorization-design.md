# 15 — Autorização limitada para a escrita em produção (DESENHO — nada implementado)

> Fase 8C.3, gate final de segurança. **Nenhum código, patch ou configuração foi criado ou alterado.** O padrão continua: **escrita remota BLOQUEADA** (`REMOTE_WRITE_ENABLED = false`, recusa de alvo de produção). Este documento é para sua revisão e aprovação.

## 1. Revisão da proposta anterior (8C.2 §7) — por que ela é insuficiente

A ideia anterior era ligar a constante `REMOTE_WRITE_ENABLED` e abrir uma exceção na recusa de produção, numa branch local temporária. Revisão:

| Fragilidade | Consequência |
|---|---|
| A permissão seria **editar código** (constante/exceção) | Quem edita o arquivo "autoriza" a si mesmo; não há prova de que **você** autorizou |
| Referência e prazo gravados no próprio código | Não são segredo nem prova; podem ser escritos por qualquer pessoa (ou ferramenta) com acesso ao repositório |
| O relógio local define o prazo | Pode ser alterado |
| Nenhuma auditoria própria da abertura/fechamento da janela | Difícil reconstruir quem, quando e com qual escopo |
| Exige mexer em testes que hoje afirmam as recusas | Enfraquece a rede de segurança justamente na hora crítica |

**Conclusão:** descartar a troca de constante. A autorização deve ser um **objeto separado, assinado por você**, que o código só **verifica**, sem nunca mudar as proteções permanentes.

## 2. Desenho proposto: bilhete de autorização assinado (Ed25519)

### 2.1 Princípios
- **O código nunca é alterado para liberar a escrita.** `REMOTE_WRITE_ENABLED` permanece `false` e a recusa de produção permanece. A única via de escrita remota é apresentar um **bilhete válido**; sem bilhete, o comportamento é exatamente o de hoje.
- **Assinatura assimétrica:** você gera um par de chaves **uma vez, no seu computador**. A **chave privada nunca sai de você** (nem o assistente nem o repositório a veem). A **chave pública** (não secreta) fica no repositório, em arquivo revisado (`authorized-signers`). Assim, **só você** consegue emitir bilhetes; o assistente consegue apenas **usá-los**.
- **Sem credenciais no bilhete:** ele não contém URL, usuário nem senha. A conexão continua vindo de `ATTR_LOAD_DATABASE_URL`, definida só no shell que roda o carregador.

### 2.2 Conteúdo do bilhete (arquivo JSON fora do repositório)
| Campo | Papel |
|---|---|
| `ticketId` | identificador único (UUID) |
| `purpose` | fixo: `attribute-matrix-load` |
| `command` | **uma** operação: `apply` ou `rollback` (cada uma exige seu próprio bilhete) |
| `matrixVersion` | `v2-2026-10-08` |
| `matrixHash` | hash **completo** da matriz (`05b3b649e91b…ffbc8`) |
| `operations` | `847` |
| `target` | banco exato no formato `host:porta/banco` |
| `maxOperations` | opcional; no piloto, `100` |
| `notBefore` / `notAfter` | janela temporal; o carregador impõe um **teto de 3 h** mesmo que o bilhete peça mais |
| `loaderDigest` | SHA-256 dos arquivos do carregador e da matriz que você revisou |
| `signature` | Ed25519 sobre o JSON canônico dos campos acima |

### 2.3 O que o carregador verifica antes de qualquer escrita (todas as condições)
1. A assinatura é válida para uma das chaves públicas autorizadas; qualquer campo adulterado invalida o bilhete.
2. `command` é igual ao comando executado; o bilhete de `apply` não serve para `rollback`.
3. Versão, **hash** e número de operações são iguais aos que o carregador **compila agora** e ao `--expect-hash` informado.
4. `target` é igual ao alvo **realmente** derivado de `ATTR_LOAD_DATABASE_URL` (não ao que o bilhete afirma).
5. A hora atual, **lida do próprio banco** (`select now()`, não do relógio local), está dentro da janela e do teto de 3 h.
6. O `loaderDigest` coincide com os arquivos que estão rodando (defesa em profundidade; ver limitação em §5).
7. O bilhete **não foi fechado** antes (ver §2.4).
8. Continuam obrigatórias **todas** as proteções atuais: `--expect-hash`, a frase `--confirm "APLICAR … EM <alvo>"`, `NODE_ENV` diferente de `production`, árvore de categorias idêntica ao inventário, esquema compatível, validador sem erros, ausência de deriva, regra de origem `seed`, reversão restrita a linhas `seed` não editadas.

Falhou qualquer item → recusa com o motivo, **nada é escrito**.

### 2.4 Auditoria (no banco, na mesma sessão de escrita)
- Antes da primeira escrita: linha `system.attribute_matrix.window_opened` em `audit_logs` com `ticketId`, comando, hash, alvo, janela e `loaderDigest`. **Se a auditoria não puder ser gravada, a escrita não começa.**
- Uma linha por lote (já existe: `batch_applied`), agora com o `ticketId`.
- Ao concluir com sucesso (e verificação final sem divergência), ou ao abortar de forma definitiva: `system.attribute_matrix.window_closed` com o resultado. **Bilhete fechado não pode ser reutilizado.** Uma queda no meio **não fecha** a janela, o que permite a **retomada** dentro do prazo.
- Diário JSONL local (fora do repositório) com o `ticketId`, sem credenciais.

### 2.5 Emissão (por você, no seu terminal)
Um comando de emissão (a criar) lê o hash e o alvo calculados pelo próprio carregador, mostra um resumo para conferência, pede confirmação e assina com a **sua** chave privada (caminho informado por você; a chave nunca é lida pelo assistente). O arquivo do bilhete (sem segredo) é entregue ao assistente, que só o apresenta ao carregador.

## 3. Cenários de ataque / erro e a resposta do desenho

| Cenário | Resposta |
|---|---|
| Assistente (ou outra ferramenta) tenta forjar autorização | Sem a chave privada, a assinatura não confere |
| Bilhete vazado | Só vale para 1 comando, 1 hash, 1 banco, 1 janela curta; fechado após o uso |
| Bilhete usado em outro banco (ex.: staging) | `target` não confere |
| Matriz alterada depois da aprovação | `matrixHash` não confere |
| `rollback` com bilhete de `apply` (ou vice-versa) | `command` não confere |
| Relógio do computador adiantado/atrasado | Prazo medido pelo relógio do banco |
| Carregador modificado para pular a verificação | `loaderDigest` diverge (e a revisão dos arquivos é do seu lado) |
| Execução acidental sem bilhete | Recusada (comportamento atual) |
| Queda no meio da carga | Retomada com o mesmo bilhete, dentro da janela |
| Repetição depois do sucesso | Bilhete fechado → recusado |

## 4. Mudanças de código necessárias (a fazer somente após sua aprovação)
Nenhuma altera as proteções existentes; todas **acrescentam** uma via condicionada ao bilhete.

| Arquivo | Mudança |
|---|---|
| `scripts/attribute-matrix/ticket.ts` (novo) | emissão e verificação (puro, testável) |
| `scripts/attribute-matrix/authorized-signers.json` (novo) | chave(s) pública(s) autorizada(s) — revisada por você |
| `scripts/attribute-matrix/loaderSafety.ts` | `assertExecutionAllowed` passa a aceitar um bilhete **já verificado** como condição adicional para escrita em alvo remoto/produção; as constantes e as recusas permanecem |
| `scripts/attribute-matrix/load.ts` | flag `--ticket <arquivo>`; leitura da hora do banco; abertura/fechamento da janela na auditoria; comando de emissão |
| `scratch/test-attr-loader-8b.ts` + novos testes | casos de adulteração (cada campo), expirado, ainda não válido, alvo/hash/comando errados, chave errada, reutilização após fechado, retomada, ausência de bilhete (continua recusando); mutação nos pontos críticos |

Sem migração. Sem deploy: o carregador roda no computador do operador e **não está no pacote publicado** (verificado). Alterar essa pasta no `main` dispararia um deploy "vazio" no Render; por isso a recomendação é manter as mudanças na branch local até você decidir.

## 5. Limitações honestas
- O `loaderDigest` é verificado pelo próprio carregador; um carregador adulterado poderia ignorá-lo. A proteção real é você revisar os arquivos listados no bilhete (o comando de emissão mostra os digests) e a ausência de acesso do assistente à sua chave privada.
- A hora do banco assume que o banco é confiável (é o alvo da própria operação).
- O bilhete autoriza o **que** e **onde**, não substitui seu backup: o backup do provedor continua sendo pré-condição (ver §6).

## 6. Estado dos requisitos de segurança (8C.3)
| Requisito | Estado |
|---|---|
| Backup do Supabase | **NÃO VERIFICADO** (sem acesso ao painel). Indicadores somente leitura no banco: `archive_mode = on`, WAL arquivado até 2026-10-09 03:03 UTC, 0 falhas — **compatível com** arquivamento/PITR, mas **não prova** que exista um backup base recuperável, a retenção, o horário nem o plano do projeto. O `pg_dump` local de 8C.2 cobre só 5 tabelas e **não substitui** o backup do provedor |
| `PRODUCT_ATTRIBUTES_STRICT` no Render | **NÃO VERIFICADO** (sem credencial/painel; variável não modificada) |
| Autorização limitada | **Desenho pronto (este documento); não implementado; aguarda aprovação** |
| Escrita remota | **BLOQUEADA** (padrão) |
