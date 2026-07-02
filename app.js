/* =====================================================================
   BetRadar BR — Análise de jogos do dia e comparação de odds
   Modo demo: odds simuladas realistas das principais casas do Brasil.
   Modo real: The Odds API (the-odds-api.com) — chave gratuita.
   Mercados: Resultado (1X2), Total de gols (Over/Under 2.5), Ambas marcam.
   ===================================================================== */

const CASAS_BR = ["Betano", "Bet365", "Superbet", "KTO", "Estrela Bet", "Betnacional"];

const MAPA_CASAS_API = {
  betano: "Betano", bet365: "Bet365", superbet: "Superbet",
  onexbet: "1xBet", pinnacle: "Pinnacle", betfair_ex_eu: "Betfair",
  betsson: "Betsson", williamhill: "William Hill", unibet_eu: "Unibet",
  betclic: "Betclic", marathonbet: "Marathon", tipico_de: "Tipico",
  sport888: "888sport", betfair: "Betfair",
};

const LIGAS_API = [
  { key: "soccer_fifa_world_cup", nome: "Copa do Mundo 2026" },
  { key: "soccer_brazil_campeonato", nome: "Brasileirão Série A" },
  { key: "soccer_brazil_serie_b", nome: "Brasileirão Série B" },
  { key: "soccer_conmebol_copa_libertadores", nome: "Libertadores" },
  { key: "soccer_epl", nome: "Premier League" },
  { key: "soccer_spain_la_liga", nome: "La Liga" },
];

// A chave da The Odds API NÃO fica no código (o site é público). Cada usuário cola a
// sua em ⚙️ Dados e ela é salva apenas no navegador dele (localStorage, privada).
const CHAVE_PADRAO = "";

/* ------------------- MERCADOS ------------------- */
// Cada mercado é um grupo de resultados mutuamente exclusivos.
const MERCADOS = [
  { id: "1x2",  nome: "Resultado (1X2)", campo: "odds",
    outcomes: [
      { chave: "casa",   rotulo: "1", desc: (j) => "Vitória " + j.timeCasa },
      { chave: "empate", rotulo: "X", desc: () => "Empate" },
      { chave: "fora",   rotulo: "2", desc: (j) => "Vitória " + j.timeFora },
    ] },
  { id: "dupla", nome: "Dupla chance", campo: "oddsDupla",
    outcomes: [
      { chave: "um_x",    rotulo: "1X", desc: (j) => j.timeCasa + " ou empate" },
      { chave: "um_dois", rotulo: "12", desc: (j) => j.timeCasa + " ou " + j.timeFora },
      { chave: "x_dois",  rotulo: "X2", desc: (j) => "Empate ou " + j.timeFora },
    ] },
  { id: "gols", nome: "Total de gols", campo: "oddsGols",
    outcomes: [
      { chave: "over",  rotulo: "+2.5", desc: () => "Mais de 2,5 gols" },
      { chave: "under", rotulo: "-2.5", desc: () => "Menos de 2,5 gols" },
    ] },
  { id: "escanteios", nome: "Escanteios", campo: "oddsEsc",
    outcomes: [
      { chave: "over",  rotulo: "+9.5", desc: () => "Mais de 9,5 escanteios" },
      { chave: "under", rotulo: "-9.5", desc: () => "Menos de 9,5 escanteios" },
    ] },
  { id: "cartoes", nome: "Cartões", campo: "oddsCartoes",
    outcomes: [
      { chave: "over",  rotulo: "+3.5", desc: () => "Mais de 3,5 cartões" },
      { chave: "under", rotulo: "-3.5", desc: () => "Menos de 3,5 cartões" },
    ] },
  { id: "btts", nome: "Ambas marcam", campo: "oddsBtts",
    outcomes: [
      { chave: "sim", rotulo: "Sim", desc: () => "Ambas marcam: Sim" },
      { chave: "nao", rotulo: "Não", desc: () => "Ambas marcam: Não" },
    ] },
];

/* ------------------- MATEMÁTICA ------------------- */
function fatorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function poisson(k, l) { return Math.exp(-l) * Math.pow(l, k) / fatorial(k); }
// P(total > linha) para linhas .5 (gols, escanteios, cartões) via Poisson
function probOver(lambda, linha) {
  let acc = 0; for (let k = 0; k <= Math.floor(linha); k++) acc += poisson(k, lambda);
  return 1 - acc;
}

/* ------------------- DADOS DEMO (simulados) ------------------- */
// Jogos reais de HOJE, 02/07/2026 — Copa do Mundo 2026, fase de 32 avos.
const JOGOS_DEMO_BASE = [
  { liga: "Copa do Mundo 2026 · 32 avos", casa: "Espanha",  fora: "Áustria", h: "16:00", forcaCasa: .66, forcaFora: .15, gols: 2.6, esc: 10.5, crt: 3.8 },
  { liga: "Copa do Mundo 2026 · 32 avos", casa: "Portugal", fora: "Croácia", h: "20:00", forcaCasa: .47, forcaFora: .28, gols: 2.5, esc: 10.0, crt: 4.8 },
  { liga: "Copa do Mundo 2026 · 32 avos", casa: "Suíça",    fora: "Argélia", h: "00:00", forcaCasa: .42, forcaFora: .30, gols: 2.3, esc: 9.4,  crt: 4.4 },
];

function gerarJogosDemo() {
  const hoje = new Date();
  let seed = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate();
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  // preço = odd a partir de prob "real", com margem da casa e ruído entre casas
  const preco = (prob) => 1 / (prob * (1.045 + rand() * 0.03)) * (0.97 + rand() * 0.09);

  return JOGOS_DEMO_BASE.map((j, i) => {
    const pCasa = j.forcaCasa, pFora = j.forcaFora, pEmpate = 1 - pCasa - pFora;
    // distribui gols esperados entre mandante/visitante pela força relativa
    const share = 0.5 + (j.forcaCasa - j.forcaFora) * 0.6; // 0..1
    const lh = j.gols * Math.min(0.65, Math.max(0.35, share));
    const la = j.gols - lh;
    const pOver = probOver(j.gols, 2.5);
    const pBtts = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
    const pEsc = probOver(j.esc, 9.5);
    const pCrt = probOver(j.crt, 3.5);

    const odds = {}, oddsDupla = {}, oddsGols = {}, oddsEsc = {}, oddsCartoes = {}, oddsBtts = {};
    CASAS_BR.forEach((c) => {
      odds[c]        = { casa: +preco(pCasa).toFixed(2), empate: +preco(pEmpate).toFixed(2), fora: +preco(pFora).toFixed(2) };
      oddsDupla[c]   = { um_x: +preco(pCasa + pEmpate).toFixed(2), um_dois: +preco(pCasa + pFora).toFixed(2), x_dois: +preco(pEmpate + pFora).toFixed(2) };
      oddsGols[c]    = { over: +preco(pOver).toFixed(2), under: +preco(1 - pOver).toFixed(2) };
      oddsEsc[c]     = { over: +preco(pEsc).toFixed(2), under: +preco(1 - pEsc).toFixed(2) };
      oddsCartoes[c] = { over: +preco(pCrt).toFixed(2), under: +preco(1 - pCrt).toFixed(2) };
      oddsBtts[c]    = { sim: +preco(pBtts).toFixed(2), nao: +preco(1 - pBtts).toFixed(2) };
    });
    return { id: "demo-" + i, liga: j.liga, timeCasa: j.casa, timeFora: j.fora, hora: j.h,
             odds, oddsDupla, oddsGols, oddsEsc, oddsCartoes, oddsBtts };
  });
}

/* ------------------- THE ODDS API (dados reais) ------------------- */
async function buscarJogosReais(apiKey) {
  const jogos = [];
  const hoje = new Date();
  for (const liga of LIGAS_API) {
    const url = `https://api.the-odds-api.com/v4/sports/${liga.key}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
    try {
      const resp = await fetch(url);
      if (resp.status === 401) throw new Error("API key inválida");
      if (!resp.ok) continue;
      const dados = await resp.json();
      for (const ev of dados) {
        const inicio = new Date(ev.commence_time);
        if (inicio.toDateString() !== hoje.toDateString()) continue;
        const odds = {}, oddsGols = {};
        for (const bk of ev.bookmakers) {
          const nome = MAPA_CASAS_API[bk.key] || bk.title;
          const h2h = bk.markets.find((m) => m.key === "h2h");
          if (h2h) {
            const b = (n) => h2h.outcomes.find((o) => o.name === n);
            const oc = b(ev.home_team), of = b(ev.away_team), oe = b("Draw");
            if (oc && of && oe) odds[nome] = { casa: oc.price, empate: oe.price, fora: of.price };
          }
          const tot = bk.markets.find((m) => m.key === "totals");
          if (tot) {
            const ov = tot.outcomes.find((o) => o.name === "Over" && Math.abs(o.point - 2.5) < 0.01);
            const un = tot.outcomes.find((o) => o.name === "Under" && Math.abs(o.point - 2.5) < 0.01);
            if (ov && un) oddsGols[nome] = { over: ov.price, under: un.price };
          }
        }
        if (Object.keys(odds).length >= 2) {
          jogos.push({
            id: ev.id, liga: liga.nome, timeCasa: ev.home_team, timeFora: ev.away_team,
            hora: inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            odds, oddsGols: Object.keys(oddsGols).length >= 2 ? oddsGols : null, oddsBtts: null,
          });
        }
      }
    } catch (e) {
      if (e.message === "API key inválida") throw e;
      console.warn("Falha ao buscar " + liga.nome, e);
    }
  }
  return jogos;
}

/* ------------------- MOTOR DE ANÁLISE ------------------- */
// Retorna, para cada mercado presente no jogo, a análise de cada resultado:
// melhor odd + casa, média do mercado, probabilidade justa (sem vig) e EV.
function analisarJogo(jogo) {
  const grupos = [];
  for (const m of MERCADOS) {
    const tabela = jogo[m.campo];
    if (!tabela) continue;
    const casas = Object.keys(tabela);
    if (casas.length < 2) continue;

    let somaProbBruta = 0;
    const parcial = m.outcomes.map((oc) => {
      const valores = casas.map((c) => tabela[c][oc.chave]);
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      let melhorOdd = 0, melhorCasa = "";
      casas.forEach((c) => { if (tabela[c][oc.chave] > melhorOdd) { melhorOdd = tabela[c][oc.chave]; melhorCasa = c; } });
      const probBruta = 1 / media;
      somaProbBruta += probBruta;
      return { ...oc, media, melhorOdd, melhorCasa, probBruta };
    });
    const outcomes = parcial.map((p) => {
      const prob = p.probBruta / somaProbBruta;
      return {
        chave: p.chave, rotulo: p.rotulo, desc: p.desc,
        media: p.media, odd: p.melhorOdd, casa: p.melhorCasa,
        prob, ev: p.melhorOdd * prob - 1,
      };
    });
    grupos.push({ id: m.id, nome: m.nome, outcomes });
  }
  return grupos;
}

function gerarPicks(jogos) {
  const picks = [];
  jogos.forEach((jogo) => {
    analisarJogo(jogo).forEach((grupo) => {
      grupo.outcomes.forEach((o) => {
        if (o.ev > 0.005 && o.prob >= 0.30) {
          picks.push({
            jogoId: jogo.id, liga: jogo.liga, hora: jogo.hora,
            jogo, mercado: grupo.nome, chave: o.chave,
            descricao: o.desc(jogo), odd: o.odd, casaAposta: o.casa,
            prob: o.prob, ev: o.ev,
            estrelas: o.ev > 0.06 ? 5 : o.ev > 0.04 ? 4 : o.ev > 0.025 ? 3 : 2,
          });
        }
      });
    });
  });
  picks.sort((x, y) => y.ev - x.ev);
  return picks.slice(0, 6);
}

function rankingCasas(jogos) {
  const placar = {};
  let total = 0;
  jogos.forEach((jogo) => {
    analisarJogo(jogo).forEach((grupo) => {
      grupo.outcomes.forEach((o) => {
        if (!placar[o.casa]) placar[o.casa] = { vezes: 0, soma: 0 };
        placar[o.casa].vezes++;
        placar[o.casa].soma += (o.odd / o.media - 1) * 100;
        total++;
      });
    });
  });
  return Object.entries(placar)
    .map(([nome, s]) => ({ nome, vezes: s.vezes, pct: (s.vezes / total) * 100, vantagemMedia: s.soma / s.vezes }))
    .sort((x, y) => y.vezes - x.vezes);
}

/* ------------------- HISTÓRICO (localStorage) ------------------- */
const HIST_KEY = "betradar_historico";
const carregarHist = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; } };
const salvarHist = (h) => localStorage.setItem(HIST_KEY, JSON.stringify(h));
const chaveDia = (d = new Date()) => d.toISOString().slice(0, 10);

// grava os picks do dia uma única vez (preserva marcações do usuário)
function registrarPicksDoDia(picks) {
  const hist = carregarHist();
  const dia = chaveDia();
  if (hist[dia]) return; // já registrado hoje
  hist[dia] = picks.map((p) => ({
    id: p.jogoId + "-" + p.chave,
    liga: p.liga, jogo: p.jogo.timeCasa + " × " + p.jogo.timeFora,
    mercado: p.mercado, descricao: p.descricao,
    odd: p.odd, casa: p.casaAposta, status: "pendente",
  }));
  salvarHist(hist);
}

function marcarPick(dia, id, status) {
  const hist = carregarHist();
  const item = (hist[dia] || []).find((x) => x.id === id);
  if (item) { item.status = item.status === status ? "pendente" : status; salvarHist(hist); renderHistorico(); }
}
window.marcarPick = marcarPick;

/* ------------------- CRITÉRIO DE KELLY ------------------- */
// Fração ótima da banca = (odd*prob - 1) / (odd - 1) = EV / (odd - 1).
// fracaoKelly aplica Kelly fracionado (¼, ½ ou cheio) para reduzir variância.
function fracaoKelly(prob, odd, multiplicador) {
  const f = (odd * prob - 1) / (odd - 1);
  return Math.max(0, f) * multiplicador;
}
const getBanca = () => parseFloat(localStorage.getItem("betradar_banca")) || 0;
const getFrac = () => parseFloat(localStorage.getItem("betradar_kellyfrac")) || 0.25;
const fmtReais = (v) => "R$ " + v.toFixed(2).replace(".", ",");

/* ------------------- RENDERIZAÇÃO ------------------- */
const $ = (s) => document.querySelector(s);
let JOGOS = [];
let filtroLiga = "Todas";

const fmtPct = (x) => (x * 100).toFixed(1).replace(".", ",") + "%";
const fmtOdd = (x) => x.toFixed(2).replace(".", ",");

function renderOportunidade() {
  const picks = gerarPicks(JOGOS);
  const el = $("#oportunidade");
  if (!picks.length) { el.classList.add("oculto"); return; }
  const p = picks[0];
  const banca = getBanca(), mult = getFrac();
  const frac = fracaoKelly(p.prob, p.odd, mult);
  const stake = banca * frac;
  const retorno = stake * p.odd;
  const lucro = stake * (p.odd - 1);
  const ganhoEsperado = stake * p.ev; // lucro médio esperado a longo prazo

  const boxes = banca > 0
    ? `<div class="opo-box"><span class="opo-label">Apostar (Kelly ${fmtPct(frac)})</span><span class="opo-valor dourado">${fmtReais(stake)}</span></div>
       <div class="opo-box"><span class="opo-label">Retorno se ganhar</span><span class="opo-valor verde">${fmtReais(retorno)}</span></div>
       <div class="opo-box"><span class="opo-label">Lucro se ganhar</span><span class="opo-valor verde">+${fmtReais(lucro)}</span></div>
       <div class="opo-box"><span class="opo-label">Ganho médio esperado</span><span class="opo-valor">+${fmtReais(ganhoEsperado)}</span></div>`
    : `<div class="opo-box"><span class="opo-label">Aposta sugerida</span><span class="opo-valor dourado">${fmtPct(frac)} da banca</span></div>
       <div class="opo-box"><span class="opo-label">Chance estimada</span><span class="opo-valor">${fmtPct(p.prob)}</span></div>
       <div class="opo-box"><span class="opo-label">Valor esperado</span><span class="opo-valor verde">+${fmtPct(p.ev)}</span></div>
       <div class="opo-box"><span class="opo-label">Defina a banca</span><span class="opo-valor" style="font-size:.95rem">na barra abaixo ↓</span></div>`;

  el.classList.remove("oculto");
  el.innerHTML = `
    <span class="opo-tag">💰 Oportunidade de ganho do dia</span>
    <div class="opo-jogo">${p.liga} • ${p.jogo.timeCasa} × ${p.jogo.timeFora} • ${p.hora}</div>
    <div class="opo-selecao">${p.descricao} <span class="opo-odd">@ ${fmtOdd(p.odd)}</span> <small style="color:var(--texto-2);font-size:.9rem">na ${p.casaAposta}</small></div>
    <div class="opo-grid">${boxes}</div>
    <div class="opo-rodape">Por que é oportunidade: a odd de <strong>${fmtOdd(p.odd)}</strong> paga mais do que a chance real de <strong>${fmtPct(p.prob)}</strong> (odd justa ${fmtOdd(1 / p.prob)}), gerando <strong>+${fmtPct(p.ev)}</strong> de valor. É a melhor entre ${JOGOS.length} jogos analisados hoje.</div>`;
}

function renderPicks() {
  const picks = gerarPicks(JOGOS);
  registrarPicksDoDia(picks);
  const el = $("#picks-do-dia");
  if (!picks.length) {
    el.innerHTML = `<div class="vazio">Nenhuma aposta de valor encontrada hoje. Dias sem valor existem — não force aposta.</div>`;
    return;
  }
  const banca = getBanca(), mult = getFrac();
  el.innerHTML = picks.map((p, i) => {
    const frac = fracaoKelly(p.prob, p.odd, mult);
    const stake = banca * frac;
    const stakeLinha = banca > 0
      ? `<div class="pick-stake">
           <span class="pick-stake-label">Apostar (Kelly)<br><span class="pick-stake-pct">${fmtPct(frac)} da banca</span></span>
           <span class="pick-stake-valor">${fmtReais(stake)}</span>
         </div>`
      : `<div class="pick-stake"><span class="pick-stake-label">Aposta sugerida: <strong>${fmtPct(frac)}</strong> da banca (Kelly)</span>
           <span class="pick-stake-pct">informe a banca ↑</span></div>`;
    return `
    <div class="pick-card ${i === 0 ? "destaque" : ""}">
      <div class="pick-topo">
        <span class="pick-liga">${p.liga} • ${p.mercado}</span>
        <span class="pick-estrelas">${"★".repeat(p.estrelas)}${"☆".repeat(5 - p.estrelas)}</span>
      </div>
      <div class="pick-jogo">${p.jogo.timeCasa} × ${p.jogo.timeFora} <small style="color:var(--texto-2)">• ${p.hora}</small></div>
      <span class="pick-selecao">Apostar: ${p.descricao}</span>
      <div class="pick-detalhes">
        <span>Melhor odd: <span class="pick-odd-casa">${fmtOdd(p.odd)} na ${p.casaAposta}</span></span>
        <span>Probabilidade estimada: <strong>${fmtPct(p.prob)}</strong> (odd justa ${fmtOdd(1 / p.prob)})</span>
        <span>Valor esperado: <span class="pick-ev">+${fmtPct(p.ev)}</span> acima do mercado</span>
      </div>
      ${stakeLinha}
    </div>`;
  }).join("");
}

function renderRanking() {
  $("#ranking-casas").innerHTML = rankingCasas(JOGOS).map((c, i) => `
    <div class="casa-linha">
      <span class="casa-pos">${i + 1}º</span>
      <span class="casa-nome">${c.nome}</span>
      <span class="casa-stat"><strong>${c.vezes}×</strong> melhor odd (${c.pct.toFixed(0)}%)</span>
      <span class="casa-stat">paga <strong>+${c.vantagemMedia.toFixed(1).replace(".", ",")}%</strong> vs. média</span>
      <div class="casa-barra-wrap"><div class="casa-barra" style="width:${c.pct}%"></div></div>
    </div>`).join("");
}

function renderFiltros() {
  const ligas = ["Todas", ...new Set(JOGOS.map((j) => j.liga))];
  $("#filtros-liga").innerHTML = ligas.map((l) =>
    `<button class="filtro-btn ${l === filtroLiga ? "ativo" : ""}" data-liga="${l}">${l}</button>`).join("");
  document.querySelectorAll(".filtro-btn").forEach((b) =>
    b.addEventListener("click", () => { filtroLiga = b.dataset.liga; renderFiltros(); renderJogos(); }));
}

// tabela de odds de um mercado (todas as casas, melhor em verde)
function tabelaMercado(jogo, grupo, m) {
  const tabela = jogo[m.campo];
  const cabec = grupo.outcomes.map((o) => `<th>${o.rotulo === "1" ? "1 · " + jogo.timeCasa : o.rotulo === "2" ? "2 · " + jogo.timeFora : o.rotulo === "X" ? "X · Empate" : o.rotulo}</th>`).join("");
  const linhas = Object.keys(tabela).map((c) => `
    <tr><td>${c}</td>${grupo.outcomes.map((o) => {
      const odd = tabela[c][o.chave];
      const ehMelhor = odd === o.odd;
      return `<td class="${ehMelhor ? "celula-melhor" : ""}">${fmtOdd(odd)}</td>`;
    }).join("")}</tr>`).join("");
  return `<div class="mercado-bloco"><div class="mercado-nome">${grupo.nome}</div>
    <table class="tabela-odds"><tr><th>Casa</th>${cabec}</tr>${linhas}</table></div>`;
}

function renderJogos() {
  const jogos = JOGOS.filter((j) => filtroLiga === "Todas" || j.liga === filtroLiga);
  const el = $("#lista-jogos");
  if (!jogos.length) { el.innerHTML = `<div class="vazio">Nenhum jogo encontrado hoje para este filtro.</div>`; return; }

  let html = "", ligaAtual = "";
  jogos.forEach((jogo) => {
    const grupos = analisarJogo(jogo);
    const g1x2 = grupos.find((g) => g.id === "1x2");
    if (jogo.liga !== ligaAtual) { ligaAtual = jogo.liga; html += `<div class="liga-header">${jogo.liga}</div>`; }

    const celulas = g1x2.outcomes.map((o) => `
      <div class="odd-melhor"><span class="odd-label">${o.rotulo}</span>
        <span class="odd-valor">${fmtOdd(o.odd)}</span><span class="odd-casa">${o.casa}</span></div>`).join("");

    const tabelas = grupos.map((g) => tabelaMercado(jogo, g, MERCADOS.find((mm) => mm.id === g.id))).join("");

    const chips = grupos.map((g) => g.outcomes.map((o) => `
      <button class="chip-aposta" data-jid="${jogo.id}" data-jogo="${jogo.timeCasa} × ${jogo.timeFora}"
        data-merc="${g.nome}" data-desc="${o.desc(jogo)}" data-odd="${o.odd}" data-casa="${o.casa}">
        ${o.desc(jogo)} <b>${fmtOdd(o.odd)}</b></button>`).join("")).join("");

    const cA = g1x2.outcomes.find((o) => o.chave === "casa");
    const cF = g1x2.outcomes.find((o) => o.chave === "fora");
    const cE = g1x2.outcomes.find((o) => o.chave === "empate");
    const fav = cA.prob >= cF.prob ? cA : cF;
    const favNome = fav === cA ? jogo.timeCasa : jogo.timeFora;

    html += `
      <div class="jogo-card" data-id="${jogo.id}">
        <div class="jogo-resumo">
          <span class="jogo-hora">${jogo.hora}</span>
          <div class="jogo-times"><span>${jogo.timeCasa}</span><span>${jogo.timeFora}</span></div>
          ${celulas}<span class="jogo-seta">▾</span>
        </div>
        <div class="jogo-detalhe">
          ${tabelas}
          <div class="aposte-block">
            <div class="aposte-titulo">🎫 Adicionar ao bilhete (monte sua múltipla):</div>
            <div class="aposte-chips">${chips}</div>
          </div>
          <div class="analise-jogo">
            <strong>📊 Análise:</strong> favorito <strong>${favNome}</strong> com
            <strong>${fmtPct(fav.prob)}</strong> de probabilidade real (empate ${fmtPct(cE.prob)}).
            Melhor pagamento no favorito: <strong>${fmtOdd(fav.odd)}</strong> na <strong>${fav.casa}</strong>.
          </div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
  document.querySelectorAll(".jogo-resumo").forEach((r) =>
    r.addEventListener("click", () => r.parentElement.classList.toggle("aberto")));
  document.querySelectorAll(".chip-aposta").forEach((ch) =>
    ch.addEventListener("click", (e) => {
      e.stopPropagation();
      adicionarAoBilhete({
        jid: ch.dataset.jid, jogo: ch.dataset.jogo, merc: ch.dataset.merc,
        desc: ch.dataset.desc, odd: parseFloat(ch.dataset.odd), casa: ch.dataset.casa,
      });
    }));
  marcarChipsSelecionados();
}

/* ------------------- BILHETE / CALCULADORA ------------------- */
let BILHETE = [];
try { BILHETE = JSON.parse(localStorage.getItem("betradar_bilhete")) || []; } catch { BILHETE = []; }
const salvarBilhete = () => localStorage.setItem("betradar_bilhete", JSON.stringify(BILHETE));

function adicionarAoBilhete(sel) {
  const jaExiste = BILHETE.findIndex((x) => x.jid === sel.jid);
  if (jaExiste >= 0) {
    // já tem seleção deste jogo: se for a mesma, remove (toggle); senão substitui
    if (BILHETE[jaExiste].desc === sel.desc) BILHETE.splice(jaExiste, 1);
    else BILHETE[jaExiste] = sel;
  } else {
    if (BILHETE.length >= 5) { avisarBilhete("Máximo de 5 jogos por bilhete."); return; }
    BILHETE.push(sel);
  }
  salvarBilhete(); renderBilhete(); marcarChipsSelecionados();
}
function removerDoBilhete(jid) {
  BILHETE = BILHETE.filter((x) => x.jid !== jid);
  salvarBilhete(); renderBilhete(); marcarChipsSelecionados();
}
window.removerDoBilhete = removerDoBilhete;

function marcarChipsSelecionados() {
  document.querySelectorAll(".chip-aposta").forEach((ch) => {
    const sel = BILHETE.find((x) => x.jid === ch.dataset.jid && x.desc === ch.dataset.desc);
    ch.classList.toggle("selecionado", !!sel);
  });
}

let avisoTimer = null;
function avisarBilhete(msg) {
  const el = $("#bilhete-aviso");
  if (!el) return;
  el.textContent = msg; el.classList.add("visivel");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove("visivel"), 2500);
}

function renderBilhete() {
  const cont = $("#bilhete-contador");
  const lista = $("#bilhete-lista");
  cont.textContent = BILHETE.length;
  cont.classList.toggle("zero", BILHETE.length === 0);

  if (!BILHETE.length) {
    lista.innerHTML = `<div class="bilhete-vazio">Abra um jogo abaixo e toque nas seleções (ex.: <b>Mais de 9,5 escanteios</b>) para montar sua múltipla. Até 5 jogos.</div>`;
  } else {
    lista.innerHTML = BILHETE.map((s) => `
      <div class="bilhete-item">
        <div class="bi-info"><span class="bi-jogo">${s.jogo}</span>
          <span class="bi-sel">${s.merc}: <b>${s.desc}</b> @ ${fmtOdd(s.odd)} <small>(${s.casa})</small></span></div>
        <button class="bi-remover" onclick="removerDoBilhete('${s.jid}')">✕</button>
      </div>`).join("");
  }

  const oddTotal = BILHETE.reduce((a, s) => a * s.odd, 1);
  const stake = parseFloat($("#bilhete-stake").value) || 0;
  const retorno = stake * oddTotal;
  const lucro = retorno - stake;
  const tipo = BILHETE.length <= 1 ? "Simples" : `Múltipla (${BILHETE.length} jogos)`;

  $("#bilhete-tipo").textContent = BILHETE.length ? tipo : "—";
  $("#bilhete-odd").textContent = BILHETE.length ? fmtOdd(oddTotal) : "—";
  $("#bilhete-retorno").textContent = BILHETE.length && stake ? fmtReais(retorno) : "—";
  $("#bilhete-lucro").textContent = BILHETE.length && stake ? "+" + fmtReais(lucro) : "—";
}

function renderHistorico() {
  const hist = carregarHist();
  const dias = Object.keys(hist).sort().reverse();
  const el = $("#historico");
  if (!dias.length) { el.innerHTML = `<div class="vazio">Os picks de hoje foram salvos. Volte amanhã e marque os resultados para acompanhar seu desempenho.</div>`; return; }

  // estatísticas gerais
  let g = 0, r = 0, lucro = 0;
  dias.forEach((d) => hist[d].forEach((p) => {
    if (p.status === "green") { g++; lucro += p.odd - 1; }
    if (p.status === "red") { r++; lucro -= 1; }
  }));
  const marcados = g + r;
  const taxa = marcados ? (g / marcados) * 100 : 0;
  const roi = marcados ? (lucro / marcados) * 100 : 0;

  const painel = `
    <div class="hist-stats">
      <div class="stat"><span class="stat-num">${marcados}</span><span class="stat-lbl">apostas resolvidas</span></div>
      <div class="stat"><span class="stat-num ${taxa >= 50 ? "pos" : "neg"}">${taxa.toFixed(0)}%</span><span class="stat-lbl">taxa de acerto</span></div>
      <div class="stat"><span class="stat-num ${lucro >= 0 ? "pos" : "neg"}">${lucro >= 0 ? "+" : ""}${lucro.toFixed(2).replace(".", ",")}u</span><span class="stat-lbl">lucro (unidades)</span></div>
      <div class="stat"><span class="stat-num ${roi >= 0 ? "pos" : "neg"}">${roi >= 0 ? "+" : ""}${roi.toFixed(1).replace(".", ",")}%</span><span class="stat-lbl">ROI</span></div>
    </div>`;

  const blocos = dias.map((d) => {
    const dataFmt = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    const linhas = hist[d].map((p) => `
      <div class="hist-linha status-${p.status}">
        <div class="hist-info">
          <span class="hist-jogo">${p.jogo}</span>
          <span class="hist-sel">${p.descricao} • ${fmtOdd(p.odd)} @ ${p.casa}</span>
        </div>
        <div class="hist-botoes">
          <button class="mini green ${p.status === "green" ? "on" : ""}" onclick="marcarPick('${d}','${p.id}','green')">✓ Green</button>
          <button class="mini red ${p.status === "red" ? "on" : ""}" onclick="marcarPick('${d}','${p.id}','red')">✕ Red</button>
        </div>
      </div>`).join("");
    return `<div class="hist-dia"><div class="hist-data">${dataFmt}</div>${linhas}</div>`;
  }).join("");

  el.innerHTML = painel + blocos;
}

function renderTudo() { renderOportunidade(); renderPicks(); renderRanking(); renderFiltros(); renderJogos(); renderHistorico(); }

/* ------------------- INICIALIZAÇÃO ------------------- */
function setBanner(t, c) { const b = $("#banner-modo"); b.textContent = t; b.className = "banner-modo " + c; }

// cache diário: evita gastar cota da API abrindo o app várias vezes no mesmo dia
const CACHE_KEY = "betradar_cache_jogos";
function lerCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function salvarCache(jogos) { localStorage.setItem(CACHE_KEY, JSON.stringify({ dia: chaveDia(), jogos })); }

async function carregar(forcar = false) {
  const apiKey = localStorage.getItem("betradar_apikey") || CHAVE_PADRAO;

  // usa o cache de hoje, a menos que o usuário clique em ↻ Atualizar
  if (!forcar) {
    const cache = lerCache();
    if (cache && cache.dia === chaveDia() && cache.jogos && cache.jogos.length) {
      JOGOS = cache.jogos;
      setBanner(`✅ Odds reais de hoje — ${JOGOS.length} jogos (em cache; ↻ Atualizar busca de novo).`, "real");
      renderTudo(); return;
    }
  }

  if (apiKey) {
    setBanner("⏳ Buscando odds reais nas casas de apostas…", "real");
    try {
      const jogos = await buscarJogosReais(apiKey);
      if (jogos.length) {
        JOGOS = jogos;
        salvarCache(jogos);
        setBanner(`✅ Odds reais ao vivo — ${jogos.length} jogos de hoje. Fonte: The Odds API.`, "real");
        renderTudo(); return;
      }
      setBanner("⚠️ Nenhum jogo com odds hoje nas ligas monitoradas. Mostrando modo demonstração.", "demo");
    } catch (e) {
      setBanner("❌ " + e.message + " — verifique a chave em ⚙️ Dados. Mostrando modo demonstração.", "erro");
    }
  } else {
    setBanner("🧪 Modo demonstração: jogos e odds simulados. Clique em ⚙️ Dados para ativar odds reais gratuitas.", "demo");
  }
  JOGOS = gerarJogosDemo();
  renderTudo();
}

$("#data-hoje").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

$("#btn-config").addEventListener("click", () => {
  $("#input-apikey").value = localStorage.getItem("betradar_apikey") || "";
  $("#modal-config").classList.remove("oculto");
});
$("#btn-fechar-modal").addEventListener("click", () => $("#modal-config").classList.add("oculto"));
$("#modal-config").addEventListener("click", (e) => { if (e.target.id === "modal-config") $("#modal-config").classList.add("oculto"); });
$("#btn-salvar-key").addEventListener("click", () => {
  const k = $("#input-apikey").value.trim();
  if (k) localStorage.setItem("betradar_apikey", k);
  $("#modal-config").classList.add("oculto"); carregar(true);
});
$("#btn-modo-demo").addEventListener("click", () => {
  localStorage.removeItem("betradar_apikey");
  $("#modal-config").classList.add("oculto"); carregar();
});
$("#btn-atualizar").addEventListener("click", () => carregar(true));

// controles de Kelly (banca + fração)
const inputBanca = $("#input-banca");
inputBanca.value = getBanca() || "";
inputBanca.addEventListener("input", () => {
  localStorage.setItem("betradar_banca", inputBanca.value || "0");
  renderOportunidade(); renderPicks();
});
document.querySelectorAll(".frac-btn").forEach((b) => {
  if (parseFloat(b.dataset.frac) === getFrac()) { /* marca o salvo */
    document.querySelectorAll(".frac-btn").forEach((x) => x.classList.remove("ativo"));
    b.classList.add("ativo");
  }
  b.addEventListener("click", () => {
    localStorage.setItem("betradar_kellyfrac", b.dataset.frac);
    document.querySelectorAll(".frac-btn").forEach((x) => x.classList.remove("ativo"));
    b.classList.add("ativo");
    renderOportunidade(); renderPicks();
  });
});

/* ---- Guia "como começar" (mostra na 1ª visita, lembra a escolha) ---- */
const guia = $("#guia-inicio");
if (localStorage.getItem("betradar_guia_oculto") === "1") guia.classList.add("oculto");
$("#btn-fechar-guia").addEventListener("click", () => {
  guia.classList.add("oculto");
  localStorage.setItem("betradar_guia_oculto", "1");
  // botão para reabrir
  if (!$("#btn-abrir-guia")) {
    const b = document.createElement("button");
    b.id = "btn-abrir-guia"; b.className = "btn-ghost btn-abrir-guia";
    b.textContent = "📖 Ver guia de como começar";
    b.addEventListener("click", () => { guia.classList.remove("oculto"); b.remove(); localStorage.removeItem("betradar_guia_oculto"); });
    guia.after(b);
  }
});

/* ---- PWA: registra service worker e trata instalação ---- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW falhou", e));
}
let promptInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); promptInstalar = e;
  $("#btn-instalar").classList.remove("oculto");
});
$("#btn-instalar").addEventListener("click", async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  $("#btn-instalar").classList.add("oculto");
});
window.addEventListener("appinstalled", () => $("#btn-instalar").classList.add("oculto"));

/* ---- Bilhete / calculadora ---- */
const bilheteEl = $("#bilhete");
$("#bilhete-toggle").addEventListener("click", () => bilheteEl.classList.toggle("aberto"));
$("#bilhete-limpar").addEventListener("click", () => {
  BILHETE = []; salvarBilhete(); renderBilhete(); marcarChipsSelecionados();
});
const inputStake = $("#bilhete-stake");
inputStake.value = localStorage.getItem("betradar_stake") || "";
inputStake.addEventListener("input", () => {
  localStorage.setItem("betradar_stake", inputStake.value || "");
  renderBilhete();
});
renderBilhete();

carregar();
