# SPEC — Simulador Financiamento (SAC/PRICE) × Consórcio

Objetivo: dada uma situação (imóvel, entrada, taxas, carta, previsão de contemplação, aluguel, custo de
oportunidade), simular **mês a mês** um financiamento SAC ou PRICE e um consórcio imobiliário, e emitir um
**veredito** (qual é melhor, por quê, resumo e detalhamento de custos).

Base de conhecimento: wiki `carteira-antifragil` (`consorcio-vs-financiamento-sac.md`, `cartas-consorcio-porto.md`,
`credito-e-alavancagem-imobiliaria.md`) e wiki `finance-knowledge-base` (`consorcio.md`,
`consorcio-mecanica-takeaways.md`). Lacunas preenchidas por pesquisa web (seção Fontes).

## 1. As duas réguas (princípio central, da wiki)

1. **Régua ingênua** — soma nominal de tudo que sai do bolso.
2. **Régua econômica (decide o veredito)** — valor presente (VP) de todos os desembolsos, descontado
   mês a mês pelo **custo de oportunidade** do usuário (rendimento líquido do dinheiro dele). Todo real
   pago cedo deixa de render. Também exibir os totais em **R$ de hoje** (deflacionados pelo IPCA).

O veredito usa a régua 2; a UI mostra as duas e explica quando divergem.

## 2. Entradas (com padrões e fonte)

Comuns:
| campo | padrão | fonte |
|---|---|---|
| valorImovel | 600.000 | — |
| valorizacaoImovelAa | 6,2% | wiki: IPCA+1,5% real |
| ipcaAa | 4,6% | BCB SGS 13522 (IPCA 12m set/2026 = 4,58%) |
| custoOportunidadeAa (líquido de IR) | 11,4% | wiki: barbell 6,5% real ≈ 11,4% nominal; Selic 13,75% (BCB SGS 432) |
| itbiPct | 3,0% | calculify.app 2026 (SP capital 3%; 2–3% no país) |
| registroPct | 0,6% | calculify.app (registro ~R$3.000 em R$500K) |
| aluguelMensal | 0,4% do imóvel (2.400) | — (parâmetro do usuário) |
| reajusteAluguelAa | 4,6% | — |
| situacaoAtual | `nova-compra` \| `consorcio-em-andamento` \| `financiamento-em-andamento` (padrão `nova-compra`) | §4b: o que já foi pago é custo afundado |

Financiamento:
| campo | padrão | fonte |
|---|---|---|
| sistema | SAC \| PRICE | Caixa FAQ (SAC e SFA/PRICE) |
| entrada | 20% do imóvel | Caixa FAQ: quota 60–90% |
| jurosAa (efetiva) | 11,5% | wiki: SFH balcão 10,26–11,70% + TR, teto 12% |
| trAm | 0,15% | BCB SGS 226 (TR out/2026 ≈ 0,13–0,17% a.m.) |
| prazoMeses | 360 (máx 420) | — |
| mipAm (sobre saldo) | 0,021% | habitacionalindividual.com.br (varia com idade) |
| dfiAm (sobre valor do imóvel) | 0,0034% | idem |
| tarifaAdmMensal | 25 | prática Caixa (verificar no contrato) |
| tarifaAvaliacao | 3.000 | calculify.app (Caixa R$2.700–3.500) |
| tarifaCadastro | 1.000 | calculify.app (R$500–1.500) |
| amortExtraMensal | 0 | — |
| modoAmortExtra | 'prazo' \| 'parcela' | — |
| parcelasPagas (m) | 0 | §4b: parcelas já pagas do financiamento; só vale em `financiamento-em-andamento` |

Consórcio:
| campo | padrão | fonte |
|---|---|---|
| valorCarta | = valorImovel − entrada? NÃO: padrão = valorImovel | — |
| prazoMeses | 200 | — |
| taxaAdmPct (total) | 19,0% | wiki: carta Porto adm 18,5%+0,5% |
| fundoReservaPct | 0,5% | wiki |
| seguroAm (sobre saldo, opcional) | 0 | — |
| reajusteCartaAa | 5,6% | média INCC (≈6,7% 12m, BCB SGS 192) e IPCA (4,6%) — regra Porto |
| mesContemplacao | 24 | — (incerto; ver sensibilidade) |
| lancePct (% da BASE) | 0 | wiki: lance incide sobre base crédito+adm+FR |
| embutidoPct (% da BASE, ≤ lancePct) | 0 | wiki: teto típico 30% |
| embutidoAbateSaldo | false | wiki (regulamento Porto art. 22.6, validado em cota real): embutido reduz crédito e NÃO abate saldo |
| modoPosLance | 'parcela' \| 'prazo' | — |
| tarifaAvaliacaoConsorcio | 2.000 | — |
| devolveFundoReserva | false | conservador |
| redutorParcelaPct (r) | 0 | §4b: regulamento Porto art. 22.6; vale em qualquer situação |
| parcelasPagas (m) | 0 | §4b: parcelas já pagas da cota não contemplada; só vale em `consorcio-em-andamento` |

## 3. Fórmulas — Financiamento

- `i = (1+jurosAa)^(1/12) − 1`; `S0 = valorImovel − entrada`.
- Mês t=1..: `Sc = S(t−1)·(1+trAm)`; `J = Sc·i`; `n_rest = prazo − t + 1`.
- **SAC**: modo 'parcela' (ou sem extra): `A = Sc / n_rest`. Modo 'prazo' com extra: `A = min(Sc, A0·F_t)`
  onde `A0 = S0/prazo` e `F_t = (1+trAm)^t`.
- **PRICE**: modo 'parcela': `P = Sc·i / (1 − (1+i)^−n_rest)`; modo 'prazo': `P = min(Sc+J, P0·F_t)` com
  `P0` a PMT inicial. `A = P − J`.
- Seguros: `MIP = mipAm·Sc`; `DFI = dfiAm·valorImovel`; tarifa mensal fixa.
- Extra: depois da parcela, `S = Sc − A − min(extra, Sc − A)`.
- Fim quando `S ≤ 0,005`. Correção monetária do mês = `Sc − S(t−1)`.
- t=0: `entrada + ITBI·V0 + registro·V0 + avaliação + cadastro` (saídas do bolso).
- **CET** (a.a.) = TIR mensal anualizada de `[+S0 − avaliação − cadastro, −(parcela+MIP+DFI+tarifa+extra)…]`.

## 4. Fórmulas — Consórcio

- `base0 = C0·(1+adm+FR)`; saldo devedor inicial `SD = base0`. Crédito corrigido `C_t`.
- **Reajuste anual**: nos meses 13, 25, 37… multiplicar `SD` e `C` (este só até a contemplação) por
  `(1+reajusteCartaAa)`.
- Parcela: `P_t = SD / n_rest` (n_rest = prazo − t + 1) + `seguroAm·SD`. Decompor a parcela em
  fundo comum / adm / FR na proporção `1 : adm : FR` (para o detalhamento).
- **Contemplação no mês k** (após pagar a parcela k): `base_k = C_k·(1+adm+FR)`; `L = lancePct·base_k`;
  `E = embutidoPct·base_k`; `caixaLance = L − E`. `SD −= caixaLance` (e `−= E` se embutidoAbateSaldo).
  `creditoDisponivel = C_k − E`. Imóvel comprado no mês k ao preço `V_k = V0·(1+valoriz)^(k/12)`.
  `complemento = max(0, V_k − creditoDisponivel)` sai do bolso; se o crédito sobra, a sobra abate `SD`.
  Custos de compra no mês k: `ITBI·V_k + registro·V_k + tarifaAvaliacaoConsorcio`.
- Pós-contemplação: modo 'parcela' → `P = SD/(prazo − k)`; modo 'prazo' → mantém a parcela anterior até zerar.
  Após a contemplação o crédito não corrige; o saldo continua reajustando anualmente.
- **Aluguel** pago nos meses 1..k: `R_t = R0·(1+reajusteAluguel)^floor((t−1)/12)`.
- Fundo de reserva devolvido no fim se `devolveFundoReserva` (valor = FR pago, nominal).
- **Custo efetivo** (a.a.) = TIR de `[−parcelas 1..k, +creditoDisponivel − caixaLance no mês k, −parcelas depois]`
  (não inclui aluguel nem complemento). Exibir também em real: `(1+cet)/(1+ipca) − 1`.
  **O fluxo é misto** (poupa antes de k, toma emprestado depois) e pode ter 0, 1 ou 2 TIRs (medido: k=60 →
  15,4% e 36%; k=100 → nenhuma; k=150 → −30,6% e 0,6%). Por isso o resultado tem `status`:
  `ok` só com raiz única na faixa −50%..100% a.a. **e** fluxo com forma de empréstimo (mais pago depois de k
  do que antes); senão `fluxo-misto` ou `sem-raiz`, taxa `n/d`, e o veredito se apoia só no VP.


## 4b. Contrato em andamento e redutor de parcela (pedido do usuário, 05/11/2026)

A comparação original supõe que a pessoa ainda não assinou nada. Quem já paga um consórcio ou um
financiamento decide **a partir de hoje**: o que já foi pago é igual nas duas escolhas e não pode pesar no
veredito. Campo `comum.situacaoAtual`:

| valor | significado |
|---|---|
| `nova-compra` (padrão) | nada contratado; comportamento das §3–§5 |
| `consorcio-em-andamento` | já paga `consorcio.parcelasPagas = m` parcelas de uma cota **não contemplada** |
| `financiamento-em-andamento` | já paga `financiamento.parcelasPagas = m` parcelas; o imóvel já é seu |

Fora de escopo (documentado na UI): consórcio **e** financiamento em andamento ao mesmo tempo.

### Regra comum: t = 0 é hoje
- O contrato em andamento é simulado desde o mês 1 do contrato; os meses `≤ m` são **já pagos (custo
  afundado)**: aparecem no detalhamento e no total "já pago", **não entram** em nominal, VP nem real.
- Fluxo do mês de contrato `mes > m` vai para `t = mes − m`. Aluguel, preço do imóvel e desconto contam a
  partir de hoje (`t`), não do início do contrato.

### Redutor de parcela (regulamento Porto art. 22.6) — vale em qualquer situação
- `consorcio.redutorParcelaPct = r` (padrão 0). Antes da contemplação a parcela-base é
  `(1 − r)·C_t·(1+adm+FR)/prazo` (a parcela cheia, como % do crédito corrigido, reduzida). A diferença
  **fica no saldo** e continua sendo reajustada.
- Após a contemplação a parcela é **recalculada sobre o saldo**: modo 'parcela' → `SD/(prazo − k)`;
  modo 'prazo' → `max(parcela cheia do mês k, SD/(prazo − k))` (com r = 0 vale a regra da §4 sem mudança).
  Consequência que a UI mostra: a parcela pós-contemplação **sobe** em relação à reduzida.

### `consorcio-em-andamento` (m parcelas pagas)
- `valorCarta` é o crédito **na adesão**; o reajuste anual segue os aniversários do contrato (13, 25…).
- Contemplação `k` é mês de contrato e é normalizada para `k ≥ m + 1` (a cota ainda não foi contemplada).
  O imóvel é comprado ao preço `V0·(1+valoriz)^((k − m)/12)`; aluguel pago em `t = 1..k − m`.
- **Opção consórcio** = seguir com a cota: fluxos dos meses `m+1..prazo`.
- **Opção financiamento** = financiar hoje (entrada, ITBI/registro, tarifas em t=0, como na §3) **e cancelar a
  cota**. A cota cancelada devolve (art. 11.1.1 / art. 10):
  - `pctAmortizado = Σ_{mes ≤ m} fundoComum_mes / C_mes` (percentual do bem pago ao fundo comum);
  - `multa = 10%` se `pctAmortizado ≤ 50%`, `5%` se `≤ 80%`, `0%` acima;
  - `restituição = pctAmortizado·C_prazo·(1 − multa)`, com `C_prazo` o crédito corrigido até o fim do grupo,
    recebida em `t = prazo − m + 2` (60 dias após a última AGO; STJ Tema 312) como **entrada** de caixa.
  - Taxa de adm e fundo de reserva já pagos não voltam. Vender/transferir a cota é alternativa citada nos
    riscos, não modelada.
- Mês de equilíbrio: varredura `k = m+1..prazo`.

### `financiamento-em-andamento` (m parcelas pagas)
- Os campos do financiamento descrevem o **contrato original** (valor do imóvel e entrada da contratação);
  a UI mostra o saldo devedor de hoje para conferir com o extrato.
- **Opção financiamento** = continuar pagando: meses `m+1..prazo`, sem entrada, ITBI ou aluguel.
- **Opção consórcio** = aderir hoje a um consórcio para quitar o financiamento ("quitação de financiamento
  próprio", uso de crédito previsto no regulamento). Até a contemplação (`t = 1..k`) paga as duas coisas.
  No mês `k`: o crédito disponível `C_k − E` quita o saldo devedor do financiamento após a parcela `m + k`;
  faltando, o **complemento** sai do bolso; sobrando, a sobra abate o saldo do consórcio. Sem ITBI, registro
  nem aluguel; a tarifa de avaliação do consórcio continua.
- As parcelas do financiamento pagas na espera entram nas categorias do financiamento (juros, amortização,
  correção, MIP, DFI, tarifas) dentro do custo da opção consórcio.

## 5. Comparação e veredito

- Horizonte H = max(último mês do financiamento, último mês do consórcio). Ao final, nos dois cenários o
  usuário possui o mesmo imóvel quitado → comparar só desembolsos.
- Para cada opção: totalNominal, VP (custo de oportunidade mensal `(1+co)^(1/12)−1`, t=0 sem desconto),
  totalReal (cada fluxo / (1+ipca)^(t/12)).
- Vencedor = menor VP. Se `|ΔVP| < 1% do valorImovel` → "Empate técnico".
- **Por quê** (razões geradas por regras, cada uma com número): CET vs custo de oportunidade; aluguel pago
  na espera (VP); taxa adm total paga; juros totais; front-loading (desembolso nos primeiros 5 anos);
  divergência entre régua ingênua e econômica quando os vencedores diferem.
- **Riscos/sensibilidade**: mês de contemplação de equilíbrio (varrer k=1..prazo, primeiro k em que o
  consórcio deixa de vencer; o VP **não é monotônico em k**, então se o consórcio já perde em k=1 a varredura
  continua: se algum k vence, a situação é "só vence a partir do mês k" — nunca afirmar "não vence em nenhum
  mês" sem ter varrido todos); veredito com custo de oportunidade ±3 p.p.; alerta se Selic/juros ≥ 12%;
  alerta de lance com embutido (rota cara, wiki); alerta "consórcio não garante data".
- **Detalhamento**: tabela de custos por categoria (juros, amortização, correção monetária, MIP, DFI,
  tarifas, ITBI/registro, taxa adm, FR, seguro, aluguel, lance em caixa, complemento) + cronograma mês a mês.

## 5b. Plano de quitação (pedido do usuário, 02/11/2026)

Para cada dívida, projeções **realistas** de como quitá-la, mais os pontos que os vendedores/bancos
costumam esconder, todos **calculados com os números do cenário** (nunca texto genérico sem número).

### Financiamento — estratégias de quitação
Para metas de quitação Y ∈ {5, 7, 10, 15 anos, prazo contratual} (só as < prazo):
- **Amortização extra mensal necessária** para zerar em Y anos (resolver por bisseção sobre
  `amortExtraMensal`, modo 'prazo'), parcela inicial total, total pago nominal, VP, **juros economizados** vs
  não amortizar.
- **Fundo de quitação (sinking fund, wiki `fundo-de-quitacao`)**: investir o mesmo extra ao custo de
  oportunidade e quitar de uma vez quando o fundo ≥ saldo devedor. Comparar VP com amortizar todo mês.
  Regra (wiki): amortizar só compensa se `CET > custo de oportunidade`; senão o fundo domina.
- Uso do FGTS (a cada 2 anos, opcional `fgtsSaldo` + `fgtsAporteMensal`): campo opcional, padrão 0.

### Consórcio — estratégias de quitação
- **Seguir as parcelas** até o fim (baseline).
- **Quitar antecipadamente no ano Y** (Y ∈ {3, 5, 7, 10}, só < prazo): pagar o saldo devedor reajustado
  naquele mês. Mostrar que a **taxa de administração não é descontada** — a economia é só os reajustes
  futuros evitados — e o VP de quitar vs seguir pagando.
- **Fundo de quitação**: investir a diferença e não antecipar (wiki G6: "nunca antecipar o consórcio" quando o
  custo da dívida restante < custo de oportunidade real). O custo marginal de manter o saldo após a
  contemplação é o **reajuste da carta** em termos reais (a adm não é descontada ao quitar), não a TIR.

### "O que não te contam" — cada item com o número do cenário
Financiamento:
1. **Saldo devedor que não cai** (PRICE): % do principal amortizado após 12 e 60 meses; na PRICE o
   saldo cai devagar no início.
2. **TR corrige o saldo**: total de correção monetária somada ao saldo ao longo do contrato.
3. **Juros totais de 30 anos** vs valor financiado (múltiplo).
4. **Seguros MIP/DFI e tarifa** somados no contrato; MIP sobe com a idade (taxa por faixa etária) — aviso.
5. **CET > taxa anunciada**: diferença em p.p. entre CET e jurosAa.
6. **Custos de entrada fora do financiamento** (ITBI+registro+avaliação+cadastro) em R$ e % do imóvel.
7. **Reduzir prazo × reduzir parcela**: VP de cada modo com o mesmo extra.
8. **Portabilidade e escolha da seguradora são direito do cliente** (texto informativo).
Consórcio:
1. **A parcela cresce**: fator parcela final / parcela inicial (reajuste anual sobre o saldo).
2. **Taxa de administração paga integralmente**, mesmo quitando antes — total em R$.
3. **Fundo de reserva** só volta no encerramento do grupo (se sobrar).
4. **Contemplação não tem data**: aluguel pago durante a espera (total e VP) e o mês de equilíbrio.
5. **Lance embutido não abate o saldo** (regra configurada): R$ de crédito perdido que você continua pagando.
6. **Crédito pode não comprar o imóvel**: complemento do próprio bolso na contemplação (valorização > reajuste).
7. **Lance incide sobre a base** (crédito+adm+FR), não sobre a carta: diferença em R$.
8. **Desistência** devolve só o fundo comum, no fim do grupo (STJ Tema 312) — risco de liquidez.
9. **Exigências na contemplação** (garantia, análise de renda, avaliação) — custo da avaliação e aviso.
10. **Golpe da "carta contemplada"** — aviso (BCB não autoriza contemplação fora de sorteio/lance).

## 6. Arquitetura (Clean Architecture)

```
src/domain/          # puro TS, sem React/IO: value objects, calculadoras, comparador, veredito
src/application/     # casos de uso + portas (ScenarioRepository)
src/infrastructure/  # Dexie (IndexedDB) — banco local
src/presentation/    # React: componentes, hooks, páginas
```
Regra de dependência: presentation → application → domain; infrastructure implementa portas de application.
Banco local: IndexedDB via Dexie (cenários salvos: id, nome, criadoEm, input, resumo).
Deploy: GitHub Pages via GitHub Actions (build Vite com `base` = nome do repo).

## 7. Fontes

- BCB SGS 226 (TR), 432 (Selic), 13522 (IPCA 12m), 192 (INCC-M) — consultados 02/11/2026.
- Caixa — Perguntas frequentes do financiamento habitacional (composição da prestação, SAC/PRICE, quota 60–90%, SFH até R$1,5M).
- habitacionalindividual.com.br — taxas MIP 0,021% (saldo) e DFI 0,0034% (avaliação).
- calculify.app/artigos/custos-extras-financiamento-imovel (jul/2026) — ITBI, registro, avaliação, cadastro.
- Lei 11.795/2008 (consórcio), Circular BCB 3.432/2009, STJ Tema 312 — via wiki.
