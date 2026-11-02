import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowSquareOut, Cat, CheckCircle, Copy, Dog, LinkSimple, Plus, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/hooks/use-toast';
import {
  chamar, contextoKey, type ClientePedido, type CotacaoSalva, type PedidoSimulacao, type Plano, type Resultado,
  useCampanhas, useCidades, useContexto, useEstados, usePlanos, useRacas, useSimulacao,
} from './api';
import { brl, resumoParaCliente } from './resumo';

interface PetForm {
  chave: number; nome: string; especie: '1' | '2'; sexo: 'M' | 'F' | null; racaNome: string; nascimento: string; coberturaId: string;
}

const novoPet = (chave: number): PetForm => ({ chave, nome: '', especie: '2', sexo: null, racaNome: '', nascimento: '', coberturaId: '' });
const CLIENTE_VAZIO: ClientePedido = {
  nome: '', cpf: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade_id: '',
};

function useDebounced<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Plano serve para a espécie? A Plamev marca TODOS, FELINO ou CANINO. */
const servePara = (p: Plano, especie: '1' | '2') => p.especie === 'TODOS' || p.especie === (especie === '1' ? 'FELINO' : 'CANINO');

function PetCampos({ org, pet, planos, podeRemover, onChange, onRemove }: {
  org: string; pet: PetForm; planos: Plano[]; podeRemover: boolean;
  onChange: (p: PetForm) => void; onRemove: () => void;
}) {
  const racas = useRacas(org, pet.especie);
  const lista = `plamev-racas-${pet.chave}`;
  const opcoes = planos.filter((p) => servePara(p, pet.especie));
  return (
    <div className="space-y-2 rounded-[6px] border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(['2', '1'] as const).map((e) => (
            <Button key={e} type="button" size="sm" variant={pet.especie === e ? 'default' : 'outline'}
              onClick={() => onChange({ ...pet, especie: e, racaNome: '', coberturaId: '' })}>
              {e === '2' ? <Dog className="mr-1 h-4 w-4" /> : <Cat className="mr-1 h-4 w-4" />}
              {e === '2' ? 'Cão' : 'Gato'}
            </Button>
          ))}
        </div>
        <Input className="h-8" placeholder="Nome do pet" value={pet.nome} onChange={(e) => onChange({ ...pet, nome: e.target.value })} />
        {podeRemover && (
          <Button type="button" size="icon" variant="ghost" aria-label="Remover pet" onClick={onRemove}>
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Sexo</Label>
        {(['M', 'F'] as const).map((s) => (
          <Button key={s} type="button" size="sm" variant={pet.sexo === s ? 'default' : 'outline'} className="h-7"
            onClick={() => onChange({ ...pet, sexo: s })}>
            {s === 'M' ? 'Macho' : 'Fêmea'}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Raça</Label>
          <Input list={lista} className="h-8" placeholder={racas.isLoading ? 'Carregando…' : 'Digite a raça'}
            value={pet.racaNome} onChange={(e) => onChange({ ...pet, racaNome: e.target.value })} />
          <datalist id={lista}>{racas.data?.map((r) => <option key={r.id} value={r.nome} />)}</datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nascimento</Label>
          <Input type="date" className="h-8" max={new Date().toISOString().slice(0, 10)} value={pet.nascimento}
            onChange={(e) => onChange({ ...pet, nascimento: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Plano</Label>
        <NativeSelect className="h-8 py-1" value={pet.coberturaId} onChange={(e) => onChange({ ...pet, coberturaId: e.target.value })}
          options={[{ value: '', label: opcoes.length ? 'Escolha o plano' : 'Escolha o estado primeiro' },
            ...opcoes.map((p) => ({ value: p.id, label: `${p.nome} · a partir de ${brl(p.cartao || p.boleto)}` }))]} />
      </div>
    </div>
  );
}

function Composicao({ titulo, linhas }: { titulo: string; linhas: Resultado['composicaoMensalidade'] }) {
  if (!linhas.length) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-muted-foreground">{titulo}</div>
      {linhas.map((l, i) => (
        <div key={i} className="flex justify-between gap-2 text-xs">
          <span className="truncate">{l.nome}</span>
          <span className={`font-data ${l.valor < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{brl(l.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/** Compara nomes ignorando acento e caixa ("São Paulo" = "sao paulo"). */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function CotacoesSalvas({ cotacoes }: { cotacoes: CotacaoSalva[] }) {
  if (!cotacoes.length) return null;
  const copiar = async (link: string) => {
    await navigator.clipboard.writeText(link);
    toast({ title: 'Link de pagamento copiado' });
  };
  return (
    <details className="rounded-[6px] border border-border p-2 text-xs" open={cotacoes.length <= 2}>
      <summary className="cursor-pointer font-medium">Cotações desta oportunidade ({cotacoes.length})</summary>
      <div className="mt-2 space-y-2">
        {cotacoes.map((c) => (
          <div key={c.numeroCotacao} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate">nº {c.numeroCotacao} · {c.pets.map((p) => p.nome || p.plano).filter(Boolean).join(', ')}</div>
              <div className="text-muted-foreground">
                {new Date(c.criadaEm).toLocaleDateString('pt-BR')} · <span className="font-data">{brl(c.mensalidade)}</span>/mês
              </div>
            </div>
            {c.linkPagamento && (
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Copiar link de pagamento"
                  onClick={() => copiar(c.linkPagamento!)}><LinkSimple className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" asChild>
                  <a href={c.linkPagamento} target="_blank" rel="noopener noreferrer" aria-label="Abrir link de pagamento">
                    <ArrowSquareOut className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function PlamevQuoteForm({ organizationId: org, opportunityId, contactId }: {
  organizationId: string; opportunityId: string | null; contactId: string | null;
}) {
  const qc = useQueryClient();
  const [estadoId, setEstadoId] = useState('');
  const [pets, setPets] = useState<PetForm[]>([novoPet(1)]);
  const [forma, setForma] = useState<1 | 2>(2);
  const [campanhaSel, setCampanhaSel] = useState('');
  const [cupomTexto, setCupomTexto] = useState('');
  const [cupom, setCupom] = useState<{ codigo: string; ok: boolean; msg?: string } | null>(null);
  const [validando, setValidando] = useState(false);
  const [abrirCliente, setAbrirCliente] = useState(false);
  const [cliente, setCliente] = useState<ClientePedido>(CLIENTE_VAZIO);
  const [gravando, setGravando] = useState(false);
  const [cotacao, setCotacao] = useState<Resultado | null>(null);

  const estados = useEstados(org);
  const contexto = useContexto(org, opportunityId, contactId);
  const doContato = contexto.data?.cliente ?? null;
  const planos = usePlanos(org, estadoId);
  const racasCao = useRacas(org, '2');
  const racasGato = useRacas(org, '1');
  const cidades = useCidades(org, estadoId, abrirCliente || !!doContato?.cidade);

  // Preenche com o contato uma vez: estado (UF ou nome) e dados do cliente; o vendedor pode mudar tudo.
  const [preenchido, setPreenchido] = useState(false);
  useEffect(() => {
    if (preenchido || !doContato || !estados.data) return;
    const uf = estados.data.find((e) => norm(e.uf) === norm(doContato.estado) || norm(e.nome) === norm(doContato.estado));
    if (uf) setEstadoId((atual) => atual || uf.id);
    setCliente((c) => ({
      ...c,
      nome: c.nome || doContato.nome, cpf: c.cpf || doContato.cpf, email: c.email || doContato.email,
      telefone: c.telefone || doContato.telefone, cep: c.cep || doContato.cep, logradouro: c.logradouro || doContato.logradouro,
      numero: c.numero || doContato.numero, complemento: c.complemento || doContato.complemento, bairro: c.bairro || doContato.bairro,
    }));
    setPreenchido(true);
  }, [preenchido, doContato, estados.data]);
  // Cidade só depois que a lista do estado chega (casa pelo nome).
  useEffect(() => {
    if (!doContato?.cidade || !cidades.data) return;
    const cidade = cidades.data.find((c) => norm(c.nome) === norm(doContato.cidade));
    if (cidade) setCliente((c) => (c.cidade_id ? c : { ...c, cidade_id: cidade.id }));
  }, [doContato, cidades.data]);

  const planoDe = (id: string) => planos.data?.find((p) => p.id === id);
  // Campanha e cupom valem por tipo de plano: só aparecem quando todos os pets estão no mesmo tipo.
  const tipos = [...new Set(pets.map((p) => planoDe(p.coberturaId)?.tipoId).filter(Boolean))] as string[];
  const tipoUnico = tipos.length === 1 && pets.every((p) => p.coberturaId) ? tipos[0] : null;
  const campanhas = useCampanhas(org, estadoId, tipoUnico);

  // Trocar estado ou tipo de plano invalida campanha e cupom escolhidos.
  useEffect(() => { setCampanhaSel(''); setCupom(null); }, [estadoId, tipoUnico]);
  useEffect(() => { setPets((ps) => ps.map((p) => ({ ...p, coberturaId: '' }))); }, [estadoId]);

  const racaId = (p: PetForm) => {
    const lista = p.especie === '2' ? racasCao.data : racasGato.data;
    const nome = p.racaNome.trim().toLowerCase();
    return lista?.find((r) => r.nome.toLowerCase() === nome)?.id ?? null;
  };

  const pedidoAgora = useMemo((): PedidoSimulacao | null => {
    if (!estadoId || !pets.length) return null;
    const montados = pets.map((p) => {
      const raca = racaId(p);
      return raca && p.nascimento && p.coberturaId
        ? { nome: p.nome.trim(), especie: p.especie, sexo: p.sexo, raca_id: raca, nascimento: p.nascimento, cobertura_id: p.coberturaId }
        : null;
    });
    if (montados.some((m) => !m)) return null;
    const [campId, tabId] = campanhaSel.split('|');
    return {
      estado_id: estadoId,
      forma_pagamento: forma,
      origem: planoDe(pets[0].coberturaId)?.origem ?? 'SITE',
      pets: montados as PedidoSimulacao['pets'],
      campanha: campId && tabId ? { id: campId, tabela_id: tabId } : null,
      cupom: cupom?.ok ? cupom.codigo : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoId, pets, forma, campanhaSel, cupom, racasCao.data, racasGato.data, planos.data]);

  const pedido = useDebounced(pedidoAgora, 500);
  const sim = useSimulacao(org, pedido);
  // Cotação gravada corresponde a um pedido; mudou o pedido, some o número.
  useEffect(() => { setCotacao(null); }, [pedidoAgora]);

  const validarCupom = async () => {
    if (!tipoUnico || !cupomTexto.trim()) return;
    setValidando(true);
    try {
      const r = await chamar<{ valido: boolean; mensagem?: string }>(org, 'cupom',
        { estado_id: estadoId, tipo_id: tipoUnico, cupom: cupomTexto.trim() });
      setCupom({ codigo: cupomTexto.trim(), ok: r.valido, msg: r.mensagem });
    } catch (e) {
      toast({ title: 'Não deu para validar o cupom', description: (e as Error).message, variant: 'destructive' });
    } finally { setValidando(false); }
  };

  const gravar = async () => {
    if (!pedidoAgora) return;
    setGravando(true);
    try {
      const r = await chamar<{ resultado: Resultado; salvaNaOportunidade?: boolean }>(org, 'solicitar', {
        ...pedidoAgora, cliente, opportunity_id: opportunityId,
        resumo_pets: pets.map((p) => ({ nome: p.nome.trim(), plano: planoDe(p.coberturaId)?.tipoNome ?? '' })),
      });
      setCotacao(r.resultado);
      if (opportunityId) await qc.invalidateQueries({ queryKey: contextoKey(org, opportunityId, contactId) });
      toast({
        title: `Cotação ${r.resultado.numeroCotacao ?? ''} gravada na Plamev`,
        description: r.salvaNaOportunidade ? 'Salva também na oportunidade.' : undefined,
      });
    } catch (e) {
      toast({ title: 'Cotação não gravada', description: (e as Error).message, variant: 'destructive' });
    } finally { setGravando(false); }
  };

  const resultado = cotacao ?? sim.data ?? null;
  const copiar = async () => {
    if (!resultado || !pedidoAgora) return;
    const texto = resumoParaCliente({
      resultado,
      pets: pets.map((p) => ({ nome: p.nome.trim(), plano: planoDe(p.coberturaId)?.tipoNome ?? '' })),
      formaPagamento: forma,
      numeroCotacao: cotacao?.numeroCotacao ?? null,
    });
    await navigator.clipboard.writeText(texto);
    toast({ title: 'Resumo copiado para enviar ao cliente' });
  };

  const copiarLink = async () => {
    if (!cotacao?.linkPagamento) return;
    await navigator.clipboard.writeText(cotacao.linkPagamento);
    toast({ title: 'Link de pagamento copiado' });
  };

  const setC = (k: keyof ClientePedido) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCliente((c) => ({ ...c, [k]: e.target.value }));
  const faltaSexo = pets.some((p) => !p.sexo);
  const clienteOk = !faltaSexo && cliente.nome && cliente.cpf.replace(/\D/g, '').length === 11 && cliente.email && cliente.telefone && cliente.cep && cliente.logradouro
    && cliente.numero && cliente.bairro && cliente.cidade_id;

  if (estados.isError) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" /> {(estados.error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CotacoesSalvas cotacoes={contexto.data?.cotacoes ?? []} />
      {opportunityId && contexto.isError && <p className="text-xs text-destructive">{(contexto.error as Error).message}</p>}
      <div className="space-y-1.5">
        <Label>Estado do cliente</Label>
        <NativeSelect value={estadoId} onChange={(e) => setEstadoId(e.target.value)} disabled={estados.isLoading}
          options={[{ value: '', label: estados.isLoading ? 'Carregando…' : 'Escolha o estado' },
            ...(estados.data ?? []).map((e) => ({ value: e.id, label: `${e.uf} · ${e.nome}` }))]} />
        {planos.isError && <p className="text-xs text-destructive">{(planos.error as Error).message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Pets</Label>
        {pets.map((p, i) => (
          <PetCampos key={p.chave} org={org} pet={p} planos={planos.data ?? []} podeRemover={pets.length > 1}
            onChange={(np) => setPets((ps) => ps.map((x, j) => (j === i ? np : x)))}
            onRemove={() => setPets((ps) => ps.filter((_, j) => j !== i))} />
        ))}
        {pets.length < 10 && (
          <Button type="button" size="sm" variant="outline"
            onClick={() => setPets((ps) => [...ps, novoPet(Math.max(...ps.map((x) => x.chave)) + 1)])}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar pet
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Pagamento</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={forma === 2 ? 'default' : 'outline'} onClick={() => setForma(2)}>Cartão de crédito</Button>
          <Button type="button" size="sm" variant={forma === 1 ? 'default' : 'outline'} onClick={() => setForma(1)}>Boleto</Button>
        </div>
      </div>

      {tipoUnico && (
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label>Campanha de desconto</Label>
            <NativeSelect value={campanhaSel} onChange={(e) => setCampanhaSel(e.target.value)} disabled={campanhas.isLoading}
              options={[{ value: '', label: campanhas.isLoading ? 'Carregando…' : 'Sem campanha (preço padrão)' },
                ...(campanhas.data ?? []).flatMap((c) => c.tabelas.map((t) => ({
                  value: `${c.id}|${t.id}`, label: c.tabelas.length > 1 ? `${c.nome} · ${t.nome}` : c.nome,
                })))]} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plamev-cupom">Cupom</Label>
            <div className="flex gap-2">
              <Input id="plamev-cupom" className="h-9" value={cupomTexto} placeholder="Código do cupom"
                onChange={(e) => { setCupomTexto(e.target.value); setCupom(null); }} />
              <Button type="button" size="sm" variant="outline" disabled={!cupomTexto.trim() || validando} onClick={validarCupom}>
                {validando ? <SpinnerGap className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
            {cupom && (
              <p className={`text-xs ${cupom.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {cupom.ok ? 'Cupom aplicado.' : cupom.msg ?? 'Cupom inválido.'}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-[6px] border border-border bg-muted/40 p-3">
        {!pedidoAgora && <p className="text-sm text-muted-foreground">Preencha estado, raça, nascimento e plano de cada pet para ver o valor.</p>}
        {pedidoAgora && (sim.isFetching || pedido !== pedidoAgora) && !resultado && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="h-4 w-4 animate-spin" /> Calculando…</div>
        )}
        {pedidoAgora && sim.isError && <p className="text-sm text-destructive">{(sim.error as Error).message}</p>}
        {pedidoAgora && resultado && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Mensalidade</div>
                <div className="font-data text-xl text-primary">{brl(resultado.totalMensalidade)}</div>
                {resultado.descontosMensalidade < 0 && (
                  <div className="text-xs text-muted-foreground line-through">{brl(resultado.mensalidade)}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Adesão (1ª cobrança)</div>
                <div className="font-data text-base">{brl(resultado.adesao)}</div>
              </div>
            </div>
            {resultado.fidelidadeAte && (
              <div className="text-xs text-muted-foreground">
                Fidelidade até {new Date(`${resultado.fidelidadeAte}T12:00:00`).toLocaleDateString('pt-BR')}
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Ver composição</summary>
              <div className="mt-2 space-y-2">
                <Composicao titulo="Mensalidade" linhas={resultado.composicaoMensalidade} />
                <Composicao titulo="Adesão" linhas={resultado.composicaoAdesao} />
              </div>
            </details>
            {cotacao?.numeroCotacao && (
              <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" weight="fill" /> Cotação nº {cotacao.numeroCotacao} gravada na Plamev
              </div>
            )}
            {cotacao?.linkPagamento && (
              <div className="space-y-1.5 rounded-[6px] border border-border bg-background p-2">
                <div className="text-xs text-muted-foreground">Link de pagamento para o cliente fechar</div>
                <div className="truncate font-data text-xs">{cotacao.linkPagamento}</div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={copiarLink}><LinkSimple className="mr-1 h-4 w-4" /> Copiar link</Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={cotacao.linkPagamento} target="_blank" rel="noopener noreferrer">
                      <ArrowSquareOut className="mr-1 h-4 w-4" /> Abrir
                    </a>
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={copiar}><Copy className="mr-1 h-4 w-4" /> Copiar resumo</Button>
              {!cotacao && (
                <Button type="button" size="sm" onClick={() => setAbrirCliente((v) => !v)}>
                  {abrirCliente ? 'Fechar' : 'Gravar cotação na Plamev'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {abrirCliente && !cotacao && pedidoAgora && (
        <div className="space-y-2 rounded-[6px] border border-border p-3">
          <div className="text-sm font-medium">Dados do cliente</div>
          <p className="text-xs text-muted-foreground">
            Grava a cotação de verdade na Plamev, com estes dados.
            {doContato && ' Preenchido com o contato; confira antes de gravar.'}
            {opportunityId && ' A cotação fica salva nesta oportunidade.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input className="col-span-2 h-8" placeholder="Nome completo" value={cliente.nome} onChange={setC('nome')} />
            <Input className="col-span-2 h-8" inputMode="numeric" placeholder="CPF" value={cliente.cpf} onChange={setC('cpf')} />
            <Input className="h-8" type="email" placeholder="E-mail" value={cliente.email} onChange={setC('email')} />
            <Input className="h-8" inputMode="tel" placeholder="Telefone com DDD" value={cliente.telefone} onChange={setC('telefone')} />
            <Input className="h-8" inputMode="numeric" placeholder="CEP" value={cliente.cep} onChange={setC('cep')} />
            <NativeSelect className="h-8 py-1" value={cliente.cidade_id} onChange={setC('cidade_id')} disabled={cidades.isLoading}
              options={[{ value: '', label: cidades.isLoading ? 'Carregando…' : 'Cidade' },
                ...(cidades.data ?? []).map((c) => ({ value: c.id, label: c.nome }))]} />
            <Input className="col-span-2 h-8" placeholder="Rua" value={cliente.logradouro} onChange={setC('logradouro')} />
            <Input className="h-8" placeholder="Número" value={cliente.numero} onChange={setC('numero')} />
            <Input className="h-8" placeholder="Complemento" value={cliente.complemento} onChange={setC('complemento')} />
            <Input className="col-span-2 h-8" placeholder="Bairro" value={cliente.bairro} onChange={setC('bairro')} />
          </div>
          {faltaSexo && <p className="text-xs text-destructive">Escolha o sexo de cada pet para gravar a cotação.</p>}
          <Button type="button" size="sm" className="w-full" disabled={!clienteOk || gravando} onClick={gravar}>
            {gravando ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : null} Gravar cotação
          </Button>
        </div>
      )}
    </div>
  );
}
