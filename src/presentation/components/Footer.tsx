const FONTES: ReadonlyArray<string> = [
  'BCB SGS 226 (TR), 432 (Selic), 13522 (IPCA 12 meses), 192 (INCC-M), consultados em 02/11/2026.',
  'Caixa: Perguntas frequentes do financiamento habitacional (composição da prestação, SAC/PRICE, quota de 60 a 90%, SFH até R$ 1,5 milhão).',
  'habitacionalindividual.com.br: taxas de MIP (0,021% sobre o saldo) e DFI (0,0034% sobre a avaliação).',
  'calculify.app/artigos/custos-extras-financiamento-imovel (jul/2026): ITBI, registro, avaliação e cadastro.',
  'Lei 11.795/2008 (consórcio), Circular BCB 3.432/2009 e STJ Tema 312.',
];

export function Footer() {
  return (
    <footer className="rodape">
      <p className="aviso">
        <strong>Simulação educacional, não é recomendação.</strong> Os resultados dependem das premissas informadas e de condições reais de contrato, que variam por banco e administradora. Confira tudo no contrato antes de decidir.
      </p>
      <h2>Fontes</h2>
      <ul>
        {FONTES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </footer>
  );
}
