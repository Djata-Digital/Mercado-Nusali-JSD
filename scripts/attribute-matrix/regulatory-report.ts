/**
 * FASE 8B — gera docs/attribute-matrix/v2/08-regulatory-review.md a partir de src/data/attributeMatrix/regulatory.ts.
 * Relatório de REVISÃO (não bloqueia categoria, publicação nem venda). Uso: npx tsx scripts/attribute-matrix/regulatory-report.ts
 */
import fs from 'fs';
import path from 'path';
import { REGULATORY_ENTRIES, type RegulatoryLevel, type RegulatoryTopic } from '../../src/data/attributeMatrix/regulatory.js';
import { MATRIX_VERSION } from '../../src/data/attributeMatrix/index.js';
import { INVENTORY_FILE, outDirFor } from './paths.js';

const inv = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8')).categories as Array<{ id: string; name: string; slug: string; parent_id: string | null }>;
const byId = new Map(inv.map((c) => [c.id, c]));
const bySlug = new Map(inv.map((c) => [c.slug, c]));
const TOPIC: Record<RegulatoryTopic, string> = {
  'sanitaria-alimentar': 'Segurança alimentar / sanitária', 'saude-dispositivo-medico': 'Saúde / dispositivo médico', 'cosmeticos-higiene': 'Cosméticos e higiene',
  'seguranca-infantil': 'Segurança infantil', 'telecomunicacoes-aviacao': 'Telecomunicações / aviação', 'privacidade-videovigilancia': 'Privacidade / videovigilância',
  'baterias-mercadorias-perigosas': 'Baterias / mercadorias perigosas', 'seguranca-eletrica': 'Segurança elétrica', 'homologacao-seguranca-individual': 'Homologação de segurança individual (EPI, capacetes, pneus)',
  'quimicos-rotulagem': 'Químicos e rotulagem', 'fitossanitario-sementes': 'Fitossanitário / sementes', 'racao-animal-sanidade': 'Ração e sanidade animal',
  'materiais-preciosos': 'Metais e pedras preciosas', 'patrimonio-cultural-fauna-flora': 'Patrimônio cultural / fauna e flora', 'objetos-cortantes': 'Objetos cortantes',
};
const LEVEL: Record<RegulatoryLevel, string> = { atencao: 'Atenção', revisao: 'Revisão', informativo: 'Informativo' };
const order: RegulatoryLevel[] = ['atencao', 'revisao', 'informativo'];
const count = (l: RegulatoryLevel) => REGULATORY_ENTRIES.filter((e) => e.level === l).length;
let md = `# 08 — Revisão regulatória (matriz ${MATRIX_VERSION})\n\n`;
md += `> **Para decisão do dono.** Nada aqui bloqueia categoria, publicação ou venda, e nada foi aplicado. Não é aconselhamento jurídico: as exigências reais dependem da legislação da Guiné-Bissau e do país de destino. Cada categoria citada existe na árvore real (validado por teste).\n\n`;
md += `**${REGULATORY_ENTRIES.length} subcategorias sinalizadas** (de 292): ${count('atencao')} em *Atenção*, ${count('revisao')} em *Revisão*, ${count('informativo')} *Informativas*.\n\n`;
md += `- **Atenção**: risco à saúde/segurança ou licenciamento específico — recomenda-se decisão antes de abrir a categoria a vendedores.\n- **Revisão**: vale definir uma regra de exibição/aviso.\n- **Informativo**: risco baixo; basta a ficha estar completa.\n\n`;
md += `Observações sobre a árvore: **não existem** categorias de medicamentos, bebidas alcoólicas, tabaco, armas ou animais vivos; por isso nenhuma dessas exigências foi sinalizada. Drones e rádios comunicadores existem e estão em *Atenção*.\n\n`;
md += `## Opções gerais (a decidir)\n\n1. **Só aviso**: texto de responsabilidade do vendedor na ficha/cadastro (menor atrito).\n2. **Campo extra opcional** (validade, norma/certificação, faixa etária) — já coberto pela matriz onde indicado.\n3. **Revisão manual** dos primeiros anúncios da categoria antes de ficarem visíveis.\n4. **Fechar a categoria** temporariamente (desativar na árvore) até haver regra — decisão de negócio; esta fase não altera categorias.\n\n`;
for (const lvl of order) {
  const list = REGULATORY_ENTRIES.filter((e) => e.level === lvl);
  md += `## ${LEVEL[lvl]} (${list.length})\n\n| Subcategoria | Categoria principal | Tema | Por quê | Opções |\n|---|---|---|---|---|\n`;
  for (const e of list) {
    const c = bySlug.get(e.slug)!; const root = c.parent_id ? byId.get(c.parent_id)?.name : '';
    md += `| ${c.name} | ${root} | ${e.topics.map((t) => TOPIC[t]).join('; ')} | ${e.why.replace(/\|/g, '/')} | ${e.options.replace(/\|/g, '/')} |\n`;
  }
  md += '\n';
}
const out = path.join(outDirFor(MATRIX_VERSION), '08-regulatory-review.md');
fs.writeFileSync(out, md.replace(/\s+$/, '') + '\n');
console.log(out, REGULATORY_ENTRIES.length);
