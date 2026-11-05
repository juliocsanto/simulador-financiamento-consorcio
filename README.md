# Simulador: Financiamento (SAC/PRICE) x Consórcio

Aplicativo web, 100% no navegador, que simula **mês a mês** um financiamento imobiliário (SAC ou PRICE) e um
consórcio de imóvel, e diz qual custa menos, por quê, com que riscos, e como quitar cada dívida.

> **Simulação educacional, não é recomendação.** O contrato real (banco ou administradora) é que vale.

## O que faz

- Simula o financiamento (juros, TR, MIP, DFI, tarifas, amortização extra reduzindo prazo ou parcela) e calcula o **CET**.
- Simula o consórcio (reajuste anual da carta, contemplação em um mês escolhido, lance sobre a base, lance embutido,
  aluguel durante a espera, complemento, custos de compra) e calcula o **custo efetivo**.
- Emite o **veredito** com razões numéricas, riscos, **mês de equilíbrio** da contemplação e sensibilidade do custo de oportunidade (±3 p.p.).
- Mostra o **plano de quitação** de cada dívida (extra necessário, fundo de quitação, FGTS, quitação antecipada do consórcio).
- Lista "**o que não te contam**": 8 itens do financiamento e 10 do consórcio, cada um com o número do seu cenário.
- Salva cenários no próprio navegador (IndexedDB via Dexie).
- Aceita **contrato em andamento** (campo "Situação atual"): nova compra, **consórcio em andamento** (cota não contemplada, com
  restituição se for cancelada) ou **financiamento em andamento** (consórcio para quitar o saldo devedor). O que já foi pago é
  custo afundado: aparece como "Já pago", mas fica fora dos totais e do veredito. Também modela o **redutor de parcela** do
  consórcio (art. 22.6 do regulamento Porto). Detalhes na SPEC, seção 4b.

## As duas réguas

1. **Régua ingênua**: soma nominal de tudo que sai do bolso.
2. **Régua econômica (decide o veredito)**: valor presente (VP) dos desembolsos, descontado mês a mês pelo seu
   **custo de oportunidade** (rendimento líquido de IR). Dinheiro pago cedo deixa de render. A tela também mostra o total em
   **R$ de hoje** (deflacionado pelo IPCA).

Vence quem tem menor VP. Se a diferença é menor que 1% do valor do imóvel, é empate técnico.
`ΔVP = VP do financiamento − VP do consórcio` (positivo: o consórcio é mais barato).

## Arquitetura (Clean Architecture)

```
presentation  ->  application  ->  domain
                       ^
infrastructure --------+   (implementa as portas da application)

src/
  domain/          TS puro, sem React nem IO
    rates.ts         conversão a.a./a.m., PMT, valor presente, TIR (Newton; fluxo misto: varredura de raízes)
    financing.ts     cronogramas SAC e PRICE (TR, MIP, DFI, tarifa, extra prazo/parcela), CET
    consortium.ts    cronograma do consórcio (reajuste, contemplação, lance na base, embutido, aluguel)
    simulation.ts    junta os dois, fluxos por categoria, VP / nominal / real
    comparison.ts    comparação, custos por categoria, séries dos gráficos
    verdict.ts       veredito, razões, riscos, equilíbrio e sensibilidade
    payoff.ts        plano de quitação (bisseção do extra, fundo de quitação, FGTS)
    hiddenCosts.ts   "o que não te contam"
  application/     portas (ScenarioRepository) e casos de uso
  infrastructure/  DexieScenarioRepository (IndexedDB) e InMemoryScenarioRepository (testes)
  presentation/    React: formulário, veredito, tabelas, gráficos (Recharts), cenários salvos
  composition.ts   raiz de composição: liga casos de uso ao repositório
  main.tsx         entrada: instancia o Dexie e injeta no App
```

A regra de dependência é verificável: `grep -rE "from ['\"](react|dexie)" src/domain src/application` não retorna nada.

## Como rodar

```bash
npm install
npm run dev          # desenvolvimento
npm test -- --run    # testes (Vitest)
npm run test:coverage  # testes + cobertura (mínimo 90% em statements/branches/functions/lines; o CI exige)
npm run build        # tsc --noEmit + vite build, saída em dist/
npm run preview      # serve o build em http://localhost:4173/simulador-financiamento-consorcio/
```

O `base` do Vite é `/simulador-financiamento-consorcio/` (GitHub Pages).

## Premissas e interpretações

- Percentuais são frações internamente (0,115 = 11,5%); só o formato de tela arredonda.
- No modo "reduzir a parcela" o financiamento recalcula a parcela todo mês, mas uma amortização extra **recorrente** continua sendo paga;
  se ela for grande, o saldo zera antes do prazo.
- Consórcio, modo "reduzir prazo" após o lance: a parcela é mantida e também recebe o reajuste anual.
- O lance incide sobre a **base** (crédito + taxa de administração + fundo de reserva) e o embutido, por padrão, **não** abate o saldo devedor.
- Contemplação sempre após pagar a parcela do mês escolhido (limitada ao prazo do grupo).
- O custo efetivo do consórcio não inclui aluguel nem complemento, conforme a SPEC (`docs/SPEC.md`). Com contemplação tardia o fluxo é misto (poupança + empréstimo) e pode ter 0 ou 2 TIRs; nesse caso a taxa aparece como `n/d` e o veredito usa só o valor presente.

## Fontes

- BCB SGS 226 (TR), 432 (Selic), 13522 (IPCA 12m), 192 (INCC-M), consultados em 02/11/2026.
- Caixa: Perguntas frequentes do financiamento habitacional (SAC/PRICE, quota 60 a 90%, SFH).
- habitacionalindividual.com.br: MIP 0,021% e DFI 0,0034%.
- calculify.app (jul/2026): ITBI, registro, avaliação e cadastro.
- Lei 11.795/2008, Circular BCB 3.432/2009 e STJ Tema 312 (via wiki `carteira-antifragil`).
