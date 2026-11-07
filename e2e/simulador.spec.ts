import { expect, test, type Page } from '@playwright/test';

const campo = (page: Page, nome: string) => page.locator(`#campo-${nome}`);

async function preencher(page: Page, nome: string, valor: number): Promise<void> {
  await campo(page, nome).fill(String(valor));
}

/** Caso do usuário: consórcio em andamento, 41 parcelas pagas, redutor 35%. */
async function casoDoUsuario(page: Page, contemplacao = 60): Promise<void> {
  await campo(page, 'situacaoAtual').selectOption('consorcio-em-andamento');
  await preencher(page, 'valorCarta', 1000000);
  await preencher(page, 'valorImovel', 1000000);
  await preencher(page, 'redutorParcelaPct', 35);
  await preencher(page, 'parcelasPagasConsorcio', 41);
  await preencher(page, 'mesContemplacao', contemplacao);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('verdict-winner')).toBeVisible();
});

test('a. nova-compra padrao carrega sem erros de console', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.reload();
  await expect(page.getByTestId('verdict-winner')).toBeVisible();
  await expect(page.getByTestId('ja-pago')).toHaveCount(0);
  await expect(page.getByTestId('restituicao')).toHaveCount(0);
  await expect(page.getByTestId('saldo-financiamento-hoje')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('b. caso do usuario: consorcio em andamento com 41 parcelas pagas', async ({ page }) => {
  await casoDoUsuario(page);
  await expect(page.getByTestId('ja-pago')).toContainText('170.658');
  await expect(page.getByTestId('ja-pago')).toContainText('41 parcelas do consórcio');
  const rest = page.getByTestId('restituicao');
  await expect(rest).toContainText('286.769');
  await expect(rest).toContainText('multa de 10,0%');
  await expect(page.getByTestId('redutor-parcela')).toContainText('35,0%');
  await expect(page.getByTestId('verdict-winner')).toHaveText('Consórcio');

  // Valor conferido no domínio (compare): imóvel de 1M → consórcio vence em todo k = 42..200.
  const nota = page.locator('.verdict .nota');
  await expect(nota).toContainText('o consórcio vence em qualquer mês');

  // Imóvel de 600k: o equilíbrio é o mês de contrato 107 (> 41: nunca um mês já pago).
  await preencher(page, 'valorImovel', 600000);
  await expect(nota).toContainText('mês 107');
  await preencher(page, 'valorImovel', 1000000);
  await expect(nota).toContainText('o consórcio vence em qualquer mês');

  await page.getByText('Cronograma mês a mês').click();
  await page.getByRole('tab', { name: 'Consórcio' }).click();
  const linhas = page.locator('details tbody tr');
  await expect(linhas.first()).toHaveClass(/pago/);
  await expect(linhas.first()).toContainText('(já pago)');
  await expect(page.locator('details tbody tr.pago')).toHaveCount(36);
  const ultimaP1 = await linhas.last().locator('td').allInnerTexts();
  await page.getByRole('button', { name: 'Próxima' }).click();
  // a página 2 continua a 1: o transporte repete o total pago e o saldo do mês 36, e o mês 37 traz o reajuste
  const transporte = page.getByTestId('transporte-consorcio');
  await expect(transporte).toContainText('(mês 36)');
  await expect(transporte).toContainText(ultimaP1[ultimaP1.length - 2]);
  await expect(transporte).toContainText(ultimaP1[ultimaP1.length - 1]);
  await expect(linhas.first().locator('th')).toContainText('37 (já pago) (reajuste)');
  // pagina 2: meses 37..72; 37..41 pagos, 42 em diante nao
  await expect(page.locator('details tbody tr.pago')).toHaveCount(5);
  await expect(linhas.nth(4)).toHaveClass(/pago/);
  await expect(linhas.nth(5)).not.toHaveClass(/pago/);

  // colunas "Valor a usar da carta" e "Total pago" ao lado do saldo devedor; total pago só cresce
  const cab = await page.locator('details thead th').allInnerTexts();
  const iSaldo = cab.indexOf('Saldo devedor');
  expect(cab.slice(iSaldo - 2, iSaldo + 1)).toEqual(['Valor a usar da carta', 'Total pago', 'Saldo devedor']);
  const brl = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
  const totais = (await page.locator(`details tbody tr td:nth-of-type(${iSaldo - 1})`).allInnerTexts()).map(brl);
  expect(totais.length).toBe(36);
  for (let i = 1; i < totais.length; i++) expect(totais[i]).toBeGreaterThan(totais[i - 1]);
  // mês 41 (última parcela paga): o total pago é o "já pago" de R$ 170.658
  expect(Math.round(totais[4])).toBeGreaterThanOrEqual(170_657);
  expect(Math.round(totais[4])).toBeLessThanOrEqual(170_659);
  const usar = (await page.locator(`details tbody tr td:nth-of-type(${iSaldo - 2})`).allInnerTexts()).map(brl);
  expect(usar.every((v) => v >= 1_000_000)).toBe(true);
});

test('c. contemplacao abaixo do minimo vira o mes 42', async ({ page }) => {
  await casoDoUsuario(page, 10);
  await expect(page.getByTestId('ja-pago')).toContainText('170.658');
  await page.getByText('Cronograma mês a mês').click();
  await page.getByRole('tab', { name: 'Consórcio' }).click();
  await page.getByRole('button', { name: 'Próxima' }).click();
  const contemplacao = page.locator('details tbody tr', { hasText: '(contemplação)' });
  await expect(contemplacao).toHaveCount(1);
  await expect(contemplacao.locator('th')).toHaveText(/^\s*42 \(contemplação\)/);
});

test('d. financiamento em andamento com 60 parcelas pagas', async ({ page }) => {
  await campo(page, 'situacaoAtual').selectOption('financiamento-em-andamento');
  await preencher(page, 'parcelasPagasFinanciamento', 60);
  await expect(page.getByTestId('saldo-financiamento-hoje')).toContainText(/R\$\s?[\d.]+/);
  await expect(page.getByTestId('saldo-financiamento-hoje')).toContainText('após 60 parcelas');
  await expect(page.getByTestId('ja-pago')).toContainText('60 parcelas do financiamento');
  await expect(page.getByTestId('restituicao')).toHaveCount(0);
});

test('e. voltar para nova-compra remove os elementos de contrato em andamento', async ({ page }) => {
  await casoDoUsuario(page);
  await expect(page.getByTestId('ja-pago')).toBeVisible();
  await campo(page, 'situacaoAtual').selectOption('nova-compra');
  await expect(page.getByTestId('ja-pago')).toHaveCount(0);
  await expect(page.getByTestId('restituicao')).toHaveCount(0);
  await expect(campo(page, 'parcelasPagasConsorcio')).toHaveCount(0);
  await expect(campo(page, 'parcelasPagasFinanciamento')).toHaveCount(0);
});

test('f. salvar, recarregar, carregar e excluir um cenario', async ({ page }) => {
  const nome = `e2e-${Date.now()}`;
  await casoDoUsuario(page);
  await expect(page.getByTestId('ja-pago')).toContainText('170.658');
  await page.locator('#nome-cenario').fill(nome);
  await page.getByRole('button', { name: 'Salvar cenário' }).click();
  const item = page.getByTestId('saved-list').locator('li', { hasText: nome });
  await expect(item).toBeVisible();

  try {
    await page.reload();
    await expect(page.getByTestId('ja-pago')).toHaveCount(0);
    const itemApos = page.getByTestId('saved-list').locator('li', { hasText: nome });
    await expect(itemApos).toBeVisible();
    await itemApos.getByRole('button', { name: 'Carregar' }).click();
    await expect(page.getByTestId('ja-pago')).toContainText('170.658');
    await expect(campo(page, 'situacaoAtual')).toHaveValue('consorcio-em-andamento');
  } finally {
    const restante = page.getByTestId('saved-list').locator('li', { hasText: nome });
    if (await restante.count()) await restante.getByRole('button', { name: `Excluir ${nome}` }).click();
  }
  await expect(page.getByTestId('saved-list').locator('li', { hasText: nome })).toHaveCount(0);
});

test('g. fundo de reserva devolvido continua na tabela de custos por categoria', async ({ page }) => {
  await campo(page, 'devolveFundoReserva').check();
  const tabela = page.locator('section[aria-labelledby="custos-title"]');
  await expect(tabela.locator('tbody th', { hasText: 'Fundo de reserva (consórcio)' })).toHaveCount(1);
});

test('h. cota quase quitada: a sobra de crédito volta em dinheiro e o consórcio não perde', async ({ page }) => {
  await campo(page, 'situacaoAtual').selectOption('consorcio-em-andamento');
  await preencher(page, 'parcelasPagasConsorcio', 199);
  await expect(page.getByText(/voltam em dinheiro/).first()).toBeVisible();
  await expect(page.getByTestId('verdict-winner')).not.toHaveText('Financiamento');
  const tabela = page.locator('section[aria-labelledby="custos-title"]');
  await expect(tabela.locator('tbody th', { hasText: 'Sobra de crédito paga em espécie' })).toHaveCount(1);
});

test('i. consorcio em andamento e financiamento melhor: mostra os proximos passos', async ({ page }) => {
  await casoDoUsuario(page, 42);
  await preencher(page, 'valorImovel', 920000);
  await preencher(page, 'lancePct', 60);
  await expect(page.getByTestId('verdict-winner')).toHaveText('Consórcio');
  await expect(page.getByTestId('proximos-passos')).toHaveCount(0);

  await preencher(page, 'entradaPct', 70);
  await expect(page.getByTestId('verdict-winner')).toHaveText('Financiamento');
  const passos = page.getByTestId('proximos-passos');
  await expect(passos).toBeVisible();
  await expect(passos.locator('ol > li').first()).toHaveAttribute('data-testid', 'passo-aprovar-credito');
  await expect(page.getByTestId('passo-nao-dar-lance')).toBeVisible();
  await expect(page.getByTestId('passo-vender-cota')).toContainText('286.769');
  await expect(page.getByTestId('passo-quitar-cedo')).toContainText('em VP');
  await passos.screenshot({ path: 'test-results/proximos-passos.png' });
});
