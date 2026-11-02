import { useEffect, useState } from 'react';
import type { ScenarioInput } from '../../domain/types';

type Grupo = 'comum' | 'financiamento' | 'consorcio';
type Tipo = 'money' | 'pct' | 'int' | 'select' | 'check';

interface CampoDef {
  grupo: Grupo;
  chave: string;
  /** atributo name do input */
  name: string;
  label: string;
  tipo: Tipo;
  /** casas decimais mostradas para campos percentuais */
  opcoes?: ReadonlyArray<{ valor: string; rotulo: string }>;
  dica?: string;
}

const SISTEMAS = [
  { valor: 'SAC', rotulo: 'SAC (parcela decrescente)' },
  { valor: 'PRICE', rotulo: 'PRICE (parcela fixa)' },
] as const;
const MODOS_EXTRA = [
  { valor: 'prazo', rotulo: 'Reduzir o prazo' },
  { valor: 'parcela', rotulo: 'Reduzir a parcela' },
] as const;

const SECOES: ReadonlyArray<{ titulo: string; campos: ReadonlyArray<CampoDef> }> = [
  {
    titulo: 'Imóvel e premissas',
    campos: [
      { grupo: 'comum', chave: 'valorImovel', name: 'valorImovel', label: 'Valor do imóvel (R$)', tipo: 'money' },
      { grupo: 'comum', chave: 'valorizacaoImovelAa', name: 'valorizacaoImovelAa', label: 'Valorização do imóvel (% a.a.)', tipo: 'pct' },
      { grupo: 'comum', chave: 'ipcaAa', name: 'ipcaAa', label: 'IPCA (% a.a.)', tipo: 'pct' },
      { grupo: 'comum', chave: 'custoOportunidadeAa', name: 'custoOportunidadeAa', label: 'Custo de oportunidade, líquido de IR (% a.a.)', tipo: 'pct', dica: 'Quanto seu dinheiro rende líquido de imposto.' },
      { grupo: 'comum', chave: 'itbiPct', name: 'itbiPct', label: 'ITBI (% do imóvel)', tipo: 'pct' },
      { grupo: 'comum', chave: 'registroPct', name: 'registroPct', label: 'Registro (% do imóvel)', tipo: 'pct' },
      { grupo: 'comum', chave: 'aluguelMensal', name: 'aluguelMensal', label: 'Aluguel mensal enquanto espera (R$)', tipo: 'money' },
      { grupo: 'comum', chave: 'reajusteAluguelAa', name: 'reajusteAluguelAa', label: 'Reajuste do aluguel (% a.a.)', tipo: 'pct' },
    ],
  },
  {
    titulo: 'Financiamento',
    campos: [
      { grupo: 'financiamento', chave: 'sistema', name: 'sistema', label: 'Sistema de amortização', tipo: 'select', opcoes: SISTEMAS },
      { grupo: 'financiamento', chave: 'entradaPct', name: 'entradaPct', label: 'Entrada (% do imóvel)', tipo: 'pct' },
      { grupo: 'financiamento', chave: 'jurosAa', name: 'jurosAa', label: 'Juros efetivos (% a.a.)', tipo: 'pct' },
      { grupo: 'financiamento', chave: 'trAm', name: 'trAm', label: 'TR (% a.m.)', tipo: 'pct' },
      { grupo: 'financiamento', chave: 'prazoMeses', name: 'prazoMeses', label: 'Prazo (meses)', tipo: 'int' },
      { grupo: 'financiamento', chave: 'mipAm', name: 'mipAm', label: 'Seguro MIP (% a.m. sobre o saldo)', tipo: 'pct' },
      { grupo: 'financiamento', chave: 'dfiAm', name: 'dfiAm', label: 'Seguro DFI (% a.m. sobre o imóvel)', tipo: 'pct' },
      { grupo: 'financiamento', chave: 'tarifaAdmMensal', name: 'tarifaAdmMensal', label: 'Tarifa de administração mensal (R$)', tipo: 'money' },
      { grupo: 'financiamento', chave: 'tarifaAvaliacao', name: 'tarifaAvaliacao', label: 'Tarifa de avaliação (R$)', tipo: 'money' },
      { grupo: 'financiamento', chave: 'tarifaCadastro', name: 'tarifaCadastro', label: 'Tarifa de cadastro (R$)', tipo: 'money' },
      { grupo: 'financiamento', chave: 'amortExtraMensal', name: 'amortExtraMensal', label: 'Amortização extra mensal (R$)', tipo: 'money' },
      { grupo: 'financiamento', chave: 'modoAmortExtra', name: 'modoAmortExtra', label: 'A extra reduz', tipo: 'select', opcoes: MODOS_EXTRA },
      { grupo: 'financiamento', chave: 'fgtsSaldo', name: 'fgtsSaldo', label: 'Saldo de FGTS disponível (R$)', tipo: 'money', dica: 'Opcional: usado a cada 2 anos no plano de quitação.' },
      { grupo: 'financiamento', chave: 'fgtsAporteMensal', name: 'fgtsAporteMensal', label: 'Aporte mensal ao FGTS (R$)', tipo: 'money' },
    ],
  },
  {
    titulo: 'Consórcio',
    campos: [
      { grupo: 'consorcio', chave: 'valorCarta', name: 'valorCarta', label: 'Valor da carta de crédito (R$)', tipo: 'money' },
      { grupo: 'consorcio', chave: 'prazoMeses', name: 'prazoMesesConsorcio', label: 'Prazo do grupo (meses)', tipo: 'int' },
      { grupo: 'consorcio', chave: 'taxaAdmPct', name: 'taxaAdmPct', label: 'Taxa de administração total (%)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'fundoReservaPct', name: 'fundoReservaPct', label: 'Fundo de reserva (%)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'seguroAm', name: 'seguroAm', label: 'Seguro (% a.m. sobre o saldo)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'reajusteCartaAa', name: 'reajusteCartaAa', label: 'Reajuste anual da carta (%)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'mesContemplacao', name: 'mesContemplacao', label: 'Mês da contemplação', tipo: 'int' },
      { grupo: 'consorcio', chave: 'lancePct', name: 'lancePct', label: 'Lance (% da base: crédito + adm + FR)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'embutidoPct', name: 'embutidoPct', label: 'Lance embutido (% da base)', tipo: 'pct' },
      { grupo: 'consorcio', chave: 'embutidoAbateSaldo', name: 'embutidoAbateSaldo', label: 'Embutido abate o saldo devedor', tipo: 'check' },
      { grupo: 'consorcio', chave: 'modoPosLance', name: 'modoPosLance', label: 'Após o lance, reduzir', tipo: 'select', opcoes: MODOS_EXTRA },
      { grupo: 'consorcio', chave: 'tarifaAvaliacaoConsorcio', name: 'tarifaAvaliacaoConsorcio', label: 'Avaliação do imóvel na contemplação (R$)', tipo: 'money' },
      { grupo: 'consorcio', chave: 'devolveFundoReserva', name: 'devolveFundoReserva', label: 'Considerar devolução do fundo de reserva', tipo: 'check' },
    ],
  },
];

const FATOR_PCT = 100;
const CASAS_PCT = 6;

const paraTela = (campo: CampoDef, v: number): number =>
  campo.tipo === 'pct' ? Number((v * FATOR_PCT).toFixed(CASAS_PCT)) : v;
const doTexto = (campo: CampoDef, texto: string): number | null => {
  const n = Number(texto.replace(',', '.'));
  if (texto.trim() === '' || !Number.isFinite(n)) return null;
  return campo.tipo === 'pct' ? n / FATOR_PCT : n;
};

interface NumeroProps {
  campo: CampoDef;
  valor: number;
  onChange: (v: number) => void;
}

function CampoNumerico({ campo, valor, onChange }: NumeroProps) {
  const externo = paraTela(campo, valor);
  const [texto, setTexto] = useState(String(externo));
  useEffect(() => {
    const atual = doTexto(campo, texto);
    if (atual === null || paraTela(campo, atual) !== externo) setTexto(String(externo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externo]);
  const id = `campo-${campo.name}`;
  return (
    <label className="campo" htmlFor={id}>
      <span className="campo-label">{campo.label}</span>
      <input
        id={id}
        name={campo.name}
        type="number"
        inputMode="decimal"
        step={campo.tipo === 'int' ? 1 : campo.tipo === 'pct' ? 0.01 : 100}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = doTexto(campo, e.target.value);
          if (n !== null) onChange(n);
        }}
      />
      {campo.dica ? <span className="campo-dica">{campo.dica}</span> : null}
    </label>
  );
}

interface Props {
  input: ScenarioInput;
  onChange: (next: ScenarioInput) => void;
  onReset: () => void;
}

export function InputForm({ input, onChange, onReset }: Props) {
  const definir = (campo: CampoDef, valor: number | string | boolean): void => {
    onChange({ ...input, [campo.grupo]: { ...input[campo.grupo], [campo.chave]: valor } });
  };
  const ler = (campo: CampoDef): unknown => (input[campo.grupo] as unknown as Record<string, unknown>)[campo.chave];

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()} aria-label="Parâmetros da simulação">
      {SECOES.map((secao) => (
        <fieldset key={secao.titulo} className="secao">
          <legend>{secao.titulo}</legend>
          <div className="campos">
            {secao.campos.map((campo) => {
              const id = `campo-${campo.name}`;
              if (campo.tipo === 'select') {
                return (
                  <label key={campo.name} className="campo" htmlFor={id}>
                    <span className="campo-label">{campo.label}</span>
                    <select id={id} name={campo.name} value={String(ler(campo))} onChange={(e) => definir(campo, e.target.value)}>
                      {campo.opcoes?.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (campo.tipo === 'check') {
                return (
                  <label key={campo.name} className="campo campo-check" htmlFor={id}>
                    <input id={id} name={campo.name} type="checkbox" checked={Boolean(ler(campo))} onChange={(e) => definir(campo, e.target.checked)} />
                    <span className="campo-label">{campo.label}</span>
                  </label>
                );
              }
              return (
                <CampoNumerico key={campo.name} campo={campo} valor={Number(ler(campo))} onChange={(v) => definir(campo, v)} />
              );
            })}
          </div>
        </fieldset>
      ))}
      <button type="button" className="btn btn-secundario" onClick={onReset}>
        Restaurar valores padrão
      </button>
    </form>
  );
}
