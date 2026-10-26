/* ==========================================================================
   QUIZ SHIKISHI: schermate e interazione

   PARTECIPANTE E PARTITE
   Un partecipante puo' giocare piu' partite di seguito («Gioca ancora»): ogni
   partita e' una riga di sessione a se', con un autore diverso e immagini mai
   viste da lui, ma tutte condividono `partecipante_id`. Consenso, istruzioni e
   domande di profilo si chiedono una volta sola; l'autodichiarazione «hai
   risposto a caso?» si ripete a ogni partita, perche' riguarda quella partita.

   MOUSE E DITO TRATTATI ALLO STESSO MODO
   Tutte le azioni passano dall'evento `click`, che il browser genera sia per il
   clic del mouse sia per il tocco (senza ritardo, grazie a touch-action:
   manipulation). Nessuna scorciatoia da tastiera per rispondere: chi usa il PC
   avrebbe tempi diversi da chi usa il tablet. Il tipo di puntatore usato
   (`mouse` / `touch` / `pen` / `tastiera`) viene comunque salvato per ogni risposta,
   cosi' l'analisi puo' controllarlo.

   COSE DA NON TOCCARE SENZA CAPIRLE
   1. Nessun riscontro prima della fine: chi sapesse l'esito giudizio per
      giudizio imparerebbe durante la sessione.
   2. Il tempo di risposta parte quando l'immagine e' DECODIFICATA e visibile,
      non quando viene richiesta: su un PC lento la differenza e' di centinaia
      di millisecondi, e dipenderebbe dal peso del file.
   3. Dopo ogni cambio di prova i pulsanti restano bloccati per 300 ms: un
      doppio tocco non deve rispondere anche alla prova successiva.
   4. L'inattivita' (90 s) vale su OGNI schermata: un dispositivo abbandonato a
      meta' non deve restare bloccato per il partecipante successivo.
   ========================================================================== */
'use strict';

(function () {

  var PROVA = /[?&]test=1\b/.test(location.search);   // tempi ridotti solo per i test automatici
  var INATTIVITA_MS = PROVA ? 4000 : 90000;
  var BLOCCO_DOPO_CAMBIO_MS = 300;
  var PRESSIONE_OPERATORE_MS = 3000;
  var INGRANDIMENTO_MAX = 1.6;        // oltre, si ingrandirebbero solo i pixel

  var DATI = window.DATI, VERSIONE = window.VERSIONE || { app: '?', pool: '?' };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var ora = function () { return performance.now(); };

  var S = null;                       // partita in corso
  var P = null;                       // partecipante in corso
  var scelteConsenso = {}, scelteDomande = {};
  var timerInattivita = null;
  var sbloccoDa = 0;
  var ultimoPuntatore = 'mouse';

  /* ── utilita' ─────────────────────────────────────────────────────────── */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function due(n) { return String(n).padStart(2, '0'); }
  function dataOggi(d) { return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }
  function quartoDOra(d) { return due(d.getHours()) + ':' + due(Math.floor(d.getMinutes() / 15) * 15); }
  function oraBreve(ms) { var d = new Date(ms); return due(d.getHours()) + ':' + due(d.getMinutes()); }
  function immagine(uid) { return 'immagini/' + uid + '.webp'; }

  /* ── lingua dell'interfaccia ──────────────────────────────────────────── */
  /* Le scritte stanno tutte in testi.js. Qui c'e' solo il meccanismo: T()
     prende la chiave nella lingua scelta, applicaTesti() la scrive negli
     elementi marcati (data-t testo, data-t-html contenuto HTML, data-t-aria
     aria-label e suggerimento). I CODICI delle risposte non passano di qui:
     'autentico', 'copia' e 'ai' restano quelli nei dati, in qualunque lingua
     sia l'interfaccia. */
  var LINGUE = ['it', 'en'];
  var lingua = 'it';

  function T(chiave, variabili) {
    var d = window.TESTI || {};
    var s = (d[lingua] || {})[chiave];
    if (s === undefined) s = (d.it || {})[chiave];
    if (s === undefined) return chiave;      // errore visibile, non scritta vuota
    if (variabili) Object.keys(variabili).forEach(function (k) {
      s = s.split('{' + k + '}').join(variabili[k]);
    });
    return s;
  }

  function applicaTesti() {
    $$('[data-t]').forEach(function (el) { el.textContent = T(el.dataset.t); });
    $$('[data-t-html]').forEach(function (el) {
      el.innerHTML = T(el.dataset.tHtml, { n: immaginiPerPartita() });
    });
    $$('[data-t-aria]').forEach(function (el) {
      var t = T(el.dataset.tAria);
      el.setAttribute('aria-label', t);
      el.title = t;
    });
    document.documentElement.lang = lingua;
    document.title = T('titolo_doc');
    // l'autore cambia a ogni partita: qui il testo generico (schermate non
    // ancora usate), quello con il nome vero lo mettono vaiDomande() e
    // vaiRisultato() quando la partita c'e'
    var da = $('#dom-autore'); if (da) da.textContent = T('q_autore_generico');
    var rt = $('#r-titolo'); if (rt) rt.textContent = T('res_titolo_generico');
    // il numero di immagini si rilegge dalle impostazioni: il markup appena
    // riscritto riparte dal valore del file
    var et = $('#istr-n'); if (et) et.textContent = immaginiPerPartita();
    var lb = $('#btn-autentico'); if (lb) lb.textContent = T('r_autentico', { autore: T('autore_generico') });
    aggiornaPulsanteLingua();
  }

  /* La sigla dice la lingua in cui si PASSA (EN mentre si legge in italiano),
     cosi' non serve sapere in che lingua e' l'interfaccia per capire il
     pulsante. */
  function aggiornaPulsanteLingua() {
    var b = $('#lingua');
    if (!b) return;
    b.textContent = T('lingua_etichetta');
    var t = T('lingua_titolo');
    b.setAttribute('aria-label', t);
    b.title = t;
  }

  function cambiaLingua() {
    lingua = lingua === 'it' ? 'en' : 'it';
    Archivio.scriviImpostazione('lingua', lingua);
    applicaTesti();
    // le due righe della schermata iniziale (partite gia' giocate, allarme) le
    // scrive vaiAvvio(): si richiama perche' cambino lingua anche loro
    vaiAvvio();
  }

  /* La lingua scelta resta sul dispositivo: chi prepara la postazione la imposta
     una volta e la ritrova al riavvio. */
  function linguaSalvata() {
    var v = Archivio.leggiImpostazione('lingua', 'it');
    return LINGUE.indexOf(v) >= 0 ? v : 'it';
  }

  /* Testo mostrato per una categoria di risposta. Il CODICE resta quello di
     Sessione ('autentico' / 'copia' / 'ai'): qui si traduce solo quello che si
     legge. */
  function etichettaRisposta(cat, nome) {
    return cat === 'autentico' ? T('r_autentico', { autore: nome })
      : cat === 'copia' ? T('r_copia') : T('r_ai');
  }

  function nomeCategoria(cat) { return T('cat_' + cat); }
  function breveCategoria(cat) { return T('breve_' + cat); }

  function statoLetto() { return Archivio.leggiImpostazione('stato', {}); }
  function statoScritto(s) { Archivio.scriviImpostazione('stato', s); }
  function immaginiPerPartita() {
    return Sessione.normalizzaN(Archivio.leggiImpostazione('immagini', Sessione.IMMAGINI_PREDEFINITE));
  }

  /* L'avviso da toccare (cartella dei risultati) compare SOLO nella schermata
     iniziale: durante una partita coprirebbe i pulsanti di risposta, e un
     partecipante si troverebbe un messaggio per l'operatore in mezzo ai piedi. */
  var avvisoCorrente = null;
  function avviso(testo, azione) {
    avvisoCorrente = testo ? { testo: testo, azione: azione || null } : null;
    rendiAvviso();
  }
  function rendiAvviso() {
    var el = $('#avviso');
    if (!avvisoCorrente || (avvisoCorrente.azione && schermataAttiva() !== 'avvio')) {
      el.hidden = true; el.classList.remove('toccabile'); el.onclick = null;
      return;
    }
    el.textContent = avvisoCorrente.testo;
    el.hidden = false;
    el.classList.toggle('toccabile', !!avvisoCorrente.azione);
    el.onclick = avvisoCorrente.azione;
  }

  function mostra(id) {
    $$('.schermata').forEach(function (s) { s.classList.toggle('attiva', s.id === id); });
    rendiAvviso();
    azzeraInattivita();
  }
  function schermataAttiva() { var s = $('.schermata.attiva'); return s ? s.id : null; }

  /* Tipo di puntatore dell'ultimo gesto. Un click con detail === 0 non viene da
     mouse o dito ma da tastiera (Invio o spazio su un pulsante con il focus). */
  document.addEventListener('pointerdown', function (e) { ultimoPuntatore = e.pointerType || 'mouse'; }, true);
  function tipoInput(e) { return e && e.detail === 0 ? 'tastiera' : ultimoPuntatore; }

  /* ── inattivita' ──────────────────────────────────────────────────────── */
  function azzeraInattivita() {
    clearTimeout(timerInattivita);
    if (schermataAttiva() === 'avvio') return;
    timerInattivita = setTimeout(function () { concludi('inattivita'); }, INATTIVITA_MS);
  }
  ['pointerdown', 'keydown', 'wheel'].forEach(function (ev) {
    document.addEventListener(ev, azzeraInattivita, true);
  });

  /* Durante le prove, spazio e Invio non devono "ripremere" il pulsante che ha
     il focus dopo un clic del mouse. */
  document.addEventListener('keydown', function (e) {
    if (schermataAttiva() === 'prova' && (e.key === ' ' || e.key === 'Enter')) e.preventDefault();
  }, true);

  /* Tempo in cui l'app non era visibile (cambio di finestra, schermo spento):
     distingue "ha pensato 40 secondi" da "ha lasciato il dispositivo". */
  var nascostaDa = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { nascostaDa = ora(); return; }
    if (nascostaDa && S && S.corrente) S.corrente.nascosto += ora() - nascostaDa;
    nascostaDa = 0;
  });

  /* ── avvio ────────────────────────────────────────────────────────────── */
  function vaiAvvio() {
    chiudiSovrapposti();
    P = null;
    var n = statoLetto().sessioni || 0;
    $('#avvio-conteggio').textContent = n
      ? (n === 1 ? T('avvio_1_partita') : T('avvio_n_partite', { n: n }))
      : '';
    mostra('avvio');
    aggiornaStatoSalvataggio();
  }

  /* Nella schermata iniziale non compare nessuna scritta tecnica: lo stato del
     salvataggio sta nel pannello operatore. L'unica eccezione e' l'allarme,
     quando i risultati NON stanno finendo su disco in nessun modo. */
  async function aggiornaStatoSalvataggio() {
    var el = $('#avvio-salvataggio');
    try {
      var modo = await modoSalvataggio();
      if (modo === 'solo_app') {
        var r = await Archivio.riepilogo();
        el.textContent = T('avvio_allarme', { n: r.non_esportate });
        el.className = 'piccolo allarme';
      } else {
        el.textContent = '';
        el.className = 'piccolo';
      }
    } catch (e) { el.textContent = ''; }
  }

  /* Svuota l'oggetto SENZA sostituirlo: i gestori dei pulsanti tengono un
     riferimento a questo oggetto, e un `= {}` li scollegherebbe. */
  function svuota(o) { Object.keys(o).forEach(function (k) { delete o[k]; }); }

  /* Esito a tre livelli, UGUALE per la persona e per il modello:
       esatto     categoria giusta
       quasi      ha capito che non era dell'autore, ma ha scelto l'altro tipo di falso
       sbagliato  autentica scambiata per falso, o falso scambiato per autentico */
  function esitoTre(risposta, categoria) {
    if (risposta === categoria) return 'esatto';
    if (risposta !== 'autentico' && categoria !== 'autentico') return 'quasi';
    return 'sbagliato';
  }

  /* Informazioni sul dispositivo utili all'analisi ma NON identificanti:
     dimensioni arrotondate a 50 px, famiglie di browser e sistema, mai lo user
     agent completo. */
  function dispositivo() {
    var ua = navigator.userAgent || '';
    var browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox'
      : /Chrome\//.test(ua) ? 'chromium' : /Safari\//.test(ua) ? 'safari' : 'altro';
    var sistema = /Windows/.test(ua) ? 'windows' : /Android/.test(ua) ? 'android'
      : (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'ios'
      : /Mac OS X/.test(ua) ? 'macos' : /Linux/.test(ua) ? 'linux' : 'altro';
    return {
      schermo_css: Math.round(window.innerWidth / 50) * 50 + 'x' + Math.round(window.innerHeight / 50) * 50,
      dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10,
      tocco: navigator.maxTouchPoints > 0 ? 1 : 0,
      puntatore: window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
      browser: browser, sistema: sistema,
    };
  }

  async function modoSalvataggio() {
    // in aula il canale e' deciso dalla configurazione (remoto.js), non da cosa
    // risponde il momento: se il wifi va e viene, la partita deve comunque
    // sapere che i suoi dati sono destinati al server
    if (modalitaAula()) return 'remoto';
    if (Archivio.serverAttivo()) return 'server';
    if ((await Archivio.statoCartella()) === 'collegata') return 'cartella';
    return Archivio.leggiImpostazione('scarica_ogni_partita', true) ? 'download' : 'solo_app';
  }

  /* Riepilogo numerico della partita: lo stesso che vede il partecipante,
     salvato anche nei dati. */
  function riepilogoPartita(partita) {
    var stimoli = partita.risposte.filter(function (x) { return x.prova.tipo === 'stimolo'; });
    var ctrl = partita.risposte.filter(function (x) { return x.prova.tipo === 'controllo'; });
    return {
      n_valutate: stimoli.length,
      punteggio_umano: stimoli.filter(function (x) { return x.dati.corretta === 1; }).length,
      punteggio_umano_tipo: stimoli.filter(function (x) { return x.dati.corretta_tipo === 1; }).length,
      punteggio_modello: stimoli.filter(function (x) { return !DATI.stimoli[x.prova.image_uid].errore_modello; }).length,
      punteggio_modello_tipo: stimoli.filter(function (x) {
        return DATI.stimoli[x.prova.image_uid].pred_modello_tipo === x.prova.categoria; }).length,
      controlli_risposti: ctrl.length,
      controlli_superati: ctrl.filter(function (x) { return x.dati.corretta === 1; }).length,
      durata_partita_ms: Math.round(ora() - partita.t0),
    };
  }

  /* ── modalita' aula (app pubblica, tanti dispositivi) ──────────────────── */
  /* Un dispositivo personale non e' una postazione presidiata: nessuno sceglie
     una cartella e nessuno passa il dispositivo a un altro. Qui si sistema
     quello che serve perche' i dati di trenta dispositivi restino
     distinguibili e arrivino tutti allo stesso posto (vedi archivio.js e
     aula/LEGGIMI.md). */
  function modalitaAula() { return Archivio.aulaConfigurata(); }

  function preparaAula() {
    if (!modalitaAula()) return;
    // 1. un nome SUO per ogni dispositivo: se restasse 'postazione-1' per tutti,
    //    i trenta file dei risultati si chiamerebbero uguale e finirebbero uno
    //    sopra l'altro, perdendo le partite di tutti tranne l'ultimo
    var postazione = Archivio.leggiImpostazione('postazione', '');
    if (!postazione || postazione === 'postazione-1') {
      Archivio.scriviImpostazione('postazione', 'aula-' + uuid().replace(/-/g, '').slice(0, 8));
    }
    // 2. un file scaricato a ogni partita qui non ha senso: i dati vanno al
    //    server, e un download sullo schermo dello studente e' solo rumore
    Archivio.scriviImpostazione('scarica_ogni_partita', false);
    // 3. niente rotella e niente ESCI: su un telefono non c'e' niente da
    //    chiudere, e le impostazioni cambierebbero il disegno della prova
    document.body.dataset.aula = '1';
    var r = $('#rotella'); if (r) r.hidden = true;
    var e = $('#esci'); if (e) e.hidden = true;

    // 4. se questa pagina e' stata aperta dal DISCO (doppio clic sul file) e non
    //    dal sito pubblicato, i risultati non arriverebbero da nessuna parte:
    //    e' la trappola piu' facile da prendere, e perderli in silenzio sarebbe
    //    il danno peggiore. L'avviso si vede solo nella schermata iniziale, che
    //    e' quella che guarda chi gestisce.
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      avvisoDalDisco();
    }
  }

  /* Promemoria per l'operatore: la modalita' aula e' configurata, ma questa
     pagina non e' servita da un sito. Si riprova toccando l'avviso. */
  function avvisoDalDisco() {
    avviso('Questo file non e\' il quiz pubblicato: apri il LINK, non il file. '
           + 'Tocca qui per riprovare', async function () {
      await Archivio.cercaRemoto();
      await Archivio.salvaSuDisco();
      if (Archivio.statoInvio().stato === 'inviato') avviso('');
      else avvisoDalDisco();
    });
  }

  /* In aula il dispositivo E' la persona: la pagina viene ricaricata spesso (si
     chiude la scheda, si spegne lo schermo) e senza questo ogni ricarica
     creerebbe un partecipante nuovo, spezzando in due la stessa persona. */
  function idPartecipante() {
    if (!modalitaAula()) return uuid();
    var v = Archivio.leggiImpostazione('dispositivo', '');
    if (!v) { v = uuid(); Archivio.scriviImpostazione('dispositivo', v); }
    return v;
  }

  /* Nuovo partecipante: azzera solo la SUA parte dello stato (autori e immagini
     gia' visti), mai i contatori del dispositivo. */
  function nuovoPartecipante() {
    // in aula il numero di partita continua quello del dispositivo, perche' il
    // partecipante E' il dispositivo: senza, dopo una ricarica la terza partita
    // tornerebbe a essere la «prima» e le domande di profilo si ripeterebbero
    var fatte = modalitaAula() ? (statoLetto().sessioni || 0) : 0;
    P = { id: idPartecipante(), partite: fatte, profilo: {}, consenso: {},
          istruzioniDa: ora(), tempoIstruzioni: '' };
    $('#istr-n').textContent = immaginiPerPartita();
    statoScritto(Sessione.nuovoPartecipante(statoLetto()));
    svuota(scelteConsenso);
    $$('#istruzioni .scelta').forEach(function (b) { b.classList.remove('selezionata'); });
    $('#btn-inizia').disabled = true;
    mostra('istruzioni');
  }

  /* Pulsanti di scelta a gruppi (data-campo): uno selezionato per campo. */
  function collegaScelte(contenitore, scelte, alCambio) {
    $$(contenitore + ' .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        scelte[b.dataset.campo] = b.dataset.valore;
        $$(contenitore + ' .scelta[data-campo="' + b.dataset.campo + '"]').forEach(function (x) {
          x.classList.toggle('selezionata', x === b);
        });
        alCambio();
      });
    });
  }

  /* ── partita ──────────────────────────────────────────────────────────── */
  async function iniziaPartita() {
    var stato = statoLetto();
    var seme = (Math.random() * 4294967296) >>> 0;
    var comp = Sessione.componi(DATI, stato, { immagini: immaginiPerPartita() }, seme);
    statoScritto(Sessione.aggiornaStato(stato, comp));

    var adesso = new Date();
    var postazione = Archivio.leggiImpostazione('postazione', 'postazione-1');
    var numero = (stato.sessioni || 0) + 1;
    P.partite++;
    var registro = {
      sessione_id: uuid(), partecipante_id: P.id, partita: P.partite,
      postazione: postazione,
      versione_app: VERSIONE.app, versione_pool: DATI.versione_pool,
      data: dataOggi(adesso), ora_inizio_15min: quartoDOra(adesso),
      seme: comp.seme, controlli: comp.controlli,
      n_immagini: comp.n_immagini, composizione: comp.composizione,
      gia_giocato: +P.consenso.gia_giocato, minorenne: +P.consenso.minorenne,
      fine: 'interrotta', risposto_a_caso: '', conosce_autore: '',
      // la lingua si sceglie solo nella schermata iniziale: vale per tutta la partita
      lingua: lingua,
      eta: P.profilo.eta || '', manga: P.profilo.manga || '',
      disegno: P.profilo.disegno || '', visto_giocare: P.profilo.visto_giocare || '',
      esportata: 0, creata_ms: Date.now(),
      file_cartella: Archivio.nomeSicuro(postazione) + '_' + dataOggi(adesso).replace(/-/g, '') + '_'
                     + String(numero).padStart(4, '0') + '.csv',
      // colonne aggiunte nella versione 1.2.0
      n_partita_dispositivo: numero, azione_finale: '', ultima_schermata: '',
      tempo_istruzioni_ms: P.partite === 1 ? P.tempoIstruzioni : '',
      durata_partita_ms: '', tempo_domande_ms: '', tempo_risultato_ms: '',
      n_valutate: '', punteggio_umano: '', punteggio_umano_tipo: '',
      punteggio_modello: '', punteggio_modello_tipo: '',
      controlli_risposti: '', controlli_superati: '',
      salvataggio: await modoSalvataggio(),
    };
    Object.assign(registro, dispositivo());

    S = { registro: registro, blocchi: comp.blocchi, b: 0, p: 0, risposte: [], corrente: null,
          completata: false, t0: ora() };
    // in aula la partita in corso non si manda a meta': parte quando finisce
    Archivio.segnaPartitaInCorso(registro.sessione_id);
    await salvaSessione();
    entraBlocco(0);
  }

  function salvaSessione() {
    return Archivio.salvaSessione(S.registro).catch(function () {
      avviso('Errore di salvataggio: chiamare chi gestisce la postazione');
    });
  }

  /* Precarica e DECODIFICA tutte le immagini del blocco mentre la persona guarda
     i riferimenti: cosi' il tempo di risposta non contiene attese di caricamento. */
  function precarica(urls) {
    urls.forEach(function (u) {
      var i = new Image(); i.src = u;
      if (i.decode) i.decode().catch(function () {});
    });
  }

  /* Opera di riferimento ingrandibile. Niente lente sopra: coprirebbe parte
     del disegno che la persona deve confrontare (la lente sta nell'etichetta
     e nella riga di istruzioni). */
  var LENTE = '<span class="lente" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M10 7v6M7 10h6"/></svg></span>';
  function ingrandibile(src) {
    return '<span class="ingrandibile"><img src="' + src + '" data-zoom="' + src + '" alt="" draggable="false">'
      + '</span>';
  }

  function entraBlocco(b) {
    var bl = S.blocchi[b];
    S.b = b; S.p = 0;
    precarica(bl.riferimenti.map(immagine).concat(bl.prove.filter(function (p) { return p.tipo === 'stimolo'; })
      .map(function (p) { return immagine(p.image_uid); })));
    $('#rif-titolo').textContent = T('rif_titolo', { autore: bl.nome });
    $('#rif-immagini').innerHTML = bl.riferimenti.map(function (u) { return ingrandibile(immagine(u)); }).join('');
    S.riferimentiDa = ora();
    mostra('riferimenti');
  }

  function iniziaProve() {
    var bl = S.blocchi[S.b];
    S.tempoRiferimenti = Math.round(ora() - S.riferimentiDa);
    $('#p-autore').textContent = bl.nome;
    $('#btn-autentico').textContent = T('r_autentico', { autore: bl.nome });
    $('#p-riferimenti').innerHTML = bl.riferimenti.map(function (u) { return ingrandibile(immagine(u)); }).join('');
    mostra('prova');
    mostraProva();
  }

  function bloccaRisposte(si) {
    $$('.risposta').forEach(function (b) { b.disabled = si; });
  }

  async function mostraProva() {
    var bl = S.blocchi[S.b], pr = bl.prove[S.p];
    bloccaRisposte(true);
    $('#p-puntini').innerHTML = bl.prove.map(function (_, i) {
      return '<i class="' + (i < S.p ? 'fatto' : '') + '"></i>';
    }).join('');
    $('#p-contatore').textContent = (S.p + 1) + ' / ' + bl.prove.length;

    var img = $('#p-immagine'), cart = $('#p-controllo');
    // lente sull'immagine da giudicare, e il fumetto sulla PRIMA immagine della
    // partita finche' la persona non ha mai aperto un ingrandimento
    $('#p-lente').hidden = pr.tipo === 'controllo';
    $('#p-suggerimento').hidden = !(pr.tipo === 'stimolo' && pr.posizione_stimolo === 0 && P && !P.haIngrandito);
    if (pr.tipo === 'controllo') {
      img.hidden = true; img.removeAttribute('src');
      $('#p-richiesto').textContent = T('cart_valore', { v: etichettaRisposta(pr.richiesto, bl.nome) });
      // il codice richiesto resta scritto anche come attributo: cosi' il testo
      // a schermo puo' cambiare lingua senza rompere i test automatici
      cart.dataset.richiesto = pr.richiesto;
      cart.hidden = false;
    } else {
      cart.hidden = true;
      img.classList.add('in-caricamento');
      img.hidden = false;
      img.src = immagine(pr.image_uid);
      img.dataset.zoom = immagine(pr.image_uid);
      try { if (img.decode) await img.decode(); } catch (e) { /* immagine rotta: si mostra comunque */ }
      if (!S || S.blocchi[S.b].prove[S.p] !== pr) return;      // sessione chiusa nel frattempo
      img.classList.remove('in-caricamento');
    }

    // due frame: il tempo parte quando la prova e' effettivamente disegnata
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!S || S.blocchi[S.b].prove[S.p] !== pr) return;
        S.corrente = { prova: pr, t0: ora(), zoom: 0, zoomStimolo: 0, zoomRiferimenti: 0,
                       tempoZoom: 0, nascosto: 0 };
        pr._comparsa = Math.round(ora() - S.t0);
        var palco = pr.tipo === 'stimolo' ? $('#p-immagine') : $('#p-controllo');
        pr._lato = Math.round(palco.getBoundingClientRect().width);
        sbloccoDa = ora() + BLOCCO_DOPO_CAMBIO_MS;
        salvaRiga(pr, null);
        bloccaRisposte(false);
      });
    });
  }

  function rigaBase(pr) {
    var bl = S.blocchi[pr.blocco];
    var r = {
      sessione_id: S.registro.sessione_id, indice: pr.indice, blocco: pr.blocco, posizione: pr.posizione,
      autore: bl.autore, fascia: bl.fascia, tipo: pr.tipo,
      controllo_richiesto: pr.tipo === 'controllo' ? pr.richiesto : '',
      image_uid: '', categoria: '', etichetta_vera: '',
      risposta: '', corretta: '', corretta_tipo: '', rt_ms: '', input: '',
      zoom_aperture: '', tempo_zoom_ms: '', tempo_nascosto_ms: '',
      tempo_riferimenti_ms: S.tempoRiferimenti,
      pred_modello: '', score_modello: '', tau: '', modello_corretto: '',
      strato_margine: '', peso_campionamento: '', margin_rank_z: '',
      // colonne aggiunte nella versione 1.2.0
      autore_nome: bl.nome, risposta_testo: '', esito: '',
      t_comparsa_ms: pr._comparsa === undefined ? '' : pr._comparsa, t_risposta_ms: '',
      posizione_stimolo: pr.tipo === 'stimolo' ? pr.posizione_stimolo : '',
      gia_vista: pr.tipo === 'stimolo' ? pr.gia_vista : '',
      zoom_stimolo: '', zoom_riferimenti: '', lato_stimolo_px: pr._lato || '',
      score_b1: '', score_b2: '', ramo_vincente: '', margine: '',
      pred_modello_tipo: '', modello_corretto_tipo: '', esito_modello: '',
    };
    if (pr.tipo === 'stimolo') {
      var st = DATI.stimoli[pr.image_uid];
      r.image_uid = pr.image_uid; r.categoria = st.categoria; r.etichetta_vera = st.etichetta_vera;
      r.pred_modello = st.pred_modello; r.score_modello = st.score_modello; r.tau = st.tau;
      r.modello_corretto = st.errore_modello ? 0 : 1;
      r.strato_margine = st.strato_margine; r.peso_campionamento = st.peso_campionamento;
      r.margin_rank_z = st.margin_rank_z;
      r.score_b1 = st.score_b1; r.score_b2 = st.score_b2; r.ramo_vincente = st.ramo_vincente;
      r.margine = st.margine; r.pred_modello_tipo = st.pred_modello_tipo;
      r.modello_corretto_tipo = st.pred_modello_tipo === st.categoria ? 1 : 0;
      r.esito_modello = esitoTre(st.pred_modello_tipo, st.categoria);
    }
    return r;
  }

  function salvaRiga(pr, risposta) {
    var r = rigaBase(pr);
    if (risposta) Object.assign(r, risposta);
    // su disco si scrive a fine partita (e all'avvio): qui basta l'archivio interno
    return Archivio.salvaRiga(r).catch(function () {
      avviso('Errore di salvataggio: chiamare chi gestisce la postazione');
    });
  }

  function rispondi(valore, e) {
    if (!S || !S.corrente || ora() < sbloccoDa) return;
    var c = S.corrente, pr = c.prova;
    S.corrente = null;                          // un secondo tocco non conta due volte
    bloccaRisposte(true);

    var corretta, correttaTipo;
    if (pr.tipo === 'controllo') {
      corretta = correttaTipo = (valore === pr.richiesto) ? 1 : 0;
    } else {
      // corretta: distingue autentico da non autentico, come il modello
      corretta = ((valore !== 'autentico') === (pr.categoria !== 'autentico')) ? 1 : 0;
      correttaTipo = (valore === pr.categoria) ? 1 : 0;
    }
    var bl = S.blocchi[S.b];
    var dati = {
      risposta: valore, corretta: corretta, corretta_tipo: correttaTipo,
      rt_ms: Math.round(ora() - c.t0), input: tipoInput(e),
      zoom_aperture: c.zoom, tempo_zoom_ms: Math.round(c.tempoZoom), tempo_nascosto_ms: Math.round(c.nascosto),
      risposta_testo: etichettaRisposta(valore, bl.nome),
      esito: pr.tipo === 'controllo' ? (corretta ? 'esatto' : 'sbagliato') : esitoTre(valore, pr.categoria),
      t_risposta_ms: Math.round(ora() - S.t0),
      zoom_stimolo: c.zoomStimolo, zoom_riferimenti: c.zoomRiferimenti,
    };
    S.risposte.push({ prova: pr, dati: dati });
    salvaRiga(pr, dati);
    if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    avanti();
  }

  function avanti() {
    var bl = S.blocchi[S.b];
    if (S.p + 1 < bl.prove.length) { S.p++; mostraProva(); return; }
    if (S.b + 1 < S.blocchi.length) { entraBlocco(S.b + 1); return; }
    vaiDomande();
  }

  /* ── domande finali e risultato ───────────────────────────────────────── */
  /* «VEDI IL RISULTATO» resta sempre premibile: prima era grigio finche' non si
     rispondeva a entrambe le domande obbligatorie, e nella seconda partita
     (senza profilo) chi rispondeva solo alla prima si sentiva «bloccato» senza
     capire perche'. Ora, se manca una risposta, la domanda si evidenzia. */
  function evidenziaMancanti() {
    var mancanti = [];
    $$('#domande [data-obbligatoria]').forEach(function (d) {
      var manca = !scelteDomande[d.dataset.obbligatoria];
      d.classList.toggle('manca', manca);
      if (manca) mancanti.push(d);
    });
    $('#dom-manca').hidden = !mancanti.length;
    return mancanti;
  }

  function vaiDomande() {
    svuota(scelteDomande);
    $$('#domande .scelta').forEach(function (b) { b.classList.remove('selezionata'); });
    $$('#domande [data-obbligatoria]').forEach(function (d) { d.classList.remove('manca'); });
    $('#dom-manca').hidden = true;
    $('#btn-domande').disabled = false;
    S.domandeDa = ora();
    // la domanda sull'autore cambia a ogni partita, perche' cambia l'autore
    $('#dom-autore').textContent = T('q_autore', { autore: S.blocchi[0].nome });
    // il profilo si chiede una volta sola per partecipante
    var giaChiesto = P.partite > 1;
    $('#profilo').hidden = giaChiesto;
    $('#profilo-nota').hidden = giaChiesto;
    mostra('domande');
  }

  async function confermaDomande() {
    var mancanti = evidenziaMancanti();
    if (mancanti.length) {
      $('#btn-domande').disabled = false;
      mancanti[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    ['eta', 'manga', 'disegno', 'visto_giocare'].forEach(function (k) {
      if (scelteDomande[k]) P.profilo[k] = scelteDomande[k];
      S.registro[k] = P.profilo[k] || '';
    });
    S.registro.risposto_a_caso = scelteDomande.risposto_a_caso || '';
    S.registro.conosce_autore = scelteDomande.conosce_autore || '';
    Object.assign(S.registro, riepilogoPartita(S));
    S.registro.tempo_domande_ms = Math.round(ora() - S.domandeDa);
    S.registro.ultima_schermata = 'risultato';
    S.registro.fine = 'completata';
    S.completata = true;
    await salvaSessione();
    // in aula l'invio passa da internet e puo' richiedere qualche secondo (o
    // ritentativi): il risultato si mostra SUBITO, e la riga di stato sotto i
    // punteggi dice quando i dati sono arrivati. Con il chiosco si aspetta
    // come sempre, perche' il disco e' immediato.
    var salvataggio = chiudiSuDisco(S.registro.sessione_id);
    if (!modalitaAula()) await salvataggio;
    vaiRisultato();
  }

  /* Schermata finale: punteggio e, per ogni immagine, la risposta data, quella
     del modello e l'esito con un segno colorato riconoscibile a colpo d'occhio.
     Nessun conto alla rovescia: con 16 immagini da riguardare sarebbe troppo
     breve. Il ritorno all'avvio lo fa l'inattivita' (90 s senza tocchi).

     Tre esiti per la persona, perche' risponde con tre categorie:
       esatto     categoria giusta
       quasi      ha capito che non era dell'autore, ma ha scelto l'altro tipo di falso
       sbagliato  autentica scambiata per falso, o falso scambiato per autentico
     Il punteggio conta esatto + quasi, cioe' la distinzione autentico / non
     autentico: e' l'unica che fa anche il modello. Si mostra come FRAZIONE piu'
     percentuale esatta: su poche immagini la sola percentuale arrotondata
     nasconderebbe la differenza fra 5 giuste su 8 e 6 su 9. */
  // I nomi delle categorie stanno in testi.js (chiavi cat_* e breve_*): si
  // leggono con nomeCategoria() e breveCategoria(), cosi' seguono la lingua
  // scelta. Le forme brevi servono alle righe «Tu» e «Modello» delle schede: il
  // nome completo sta gia' nella riga «Era:», e quello lungo non ci stava nelle
  // colonne strette.
  var SEGNO = { esatto: '✓', quasi: '✓', sbagliato: '✗' };

  function percentuale(a, b) {
    if (!b) return '—';
    var v = 100 * a / b;
    return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)) + '%';
  }

  function vaiRisultato() {
    var bl = S.blocchi[0];
    var stimoli = S.risposte.filter(function (x) { return x.prova.tipo === 'stimolo'; });
    var n = stimoli.length;
    var tu = stimoli.filter(function (x) { return x.dati.corretta === 1; }).length;
    var modello = stimoli.filter(function (x) { return !DATI.stimoli[x.prova.image_uid].errore_modello; }).length;

    $('#r-tu').textContent = tu + '/' + n;
    $('#r-tu-perc').textContent = percentuale(tu, n);
    $('#r-modello').textContent = modello + '/' + n;
    $('#r-modello-perc').textContent = percentuale(modello, n);
    var rp = S.registro;
    $('#r-tipo').textContent = T('res_tipo', { x: rp.punteggio_umano_tipo, n: n, y: rp.punteggio_modello_tipo });
    S.risultatoDa = ora();
    $('#btn-ancora').disabled = false;
    $('#r-titolo').textContent = T('res_titolo', { autore: bl.nome });
    aggiornaRigaInvio();

    $('#r-griglia').innerHTML = stimoli.map(function (x) {
      var uid = x.prova.image_uid, st = DATI.stimoli[uid];
      var esito = x.dati.corretta_tipo === 1 ? 'esatto' : x.dati.corretta === 1 ? 'quasi' : 'sbagliato';
      // il modello e' giudicato con la stessa regola a tre livelli della persona
      var esitoMod = esitoTre(st.pred_modello_tipo, st.categoria);
      var detto = breveCategoria(x.dati.risposta);
      var dettoModello = breveCategoria(st.pred_modello_tipo);
      return '<figure class="scheda ' + esito + '">'
        + '<div class="mini"><img src="' + immagine(uid) + '" data-zoom="' + immagine(uid) + '" alt="" draggable="false">' + LENTE
        + '<i class="segno bollo ' + esito + '">' + SEGNO[esito] + '</i></div>'
        + '<figcaption>'
        + '<div class="era">' + T('era') + ' <b>' + nomeCategoria(st.categoria) + '</b></div>'
        + '<div class="riga"><span class="chi">' + T('chi_tu') + '</span><span class="cosa">' + detto + '</span>'
        + '<i class="segno ' + esito + '">' + SEGNO[esito] + '</i></div>'
        + '<div class="riga modello"><span class="chi">' + T('chi_modello') + '</span><span class="cosa">' + dettoModello + '</span>'
        + '<i class="segno ' + esitoMod + '">' + SEGNO[esitoMod] + '</i></div>'
        + '</figcaption></figure>';
    }).join('');

    mostra('risultato');
    $('#risultato').scrollTop = 0;
    adattaGriglia();
  }

  /* Modalita' aula: sotto i punteggi, se i risultati di QUESTA partita sono
     arrivati al server. Serve al docente, che a fine lezione chiede alla classe
     «avete tutti la spunta?» prima che qualcuno chiuda la pagina. */
  function aggiornaRigaInvio() {
    var el = $('#r-invio');
    if (!el) return;
    var sid = S && S.registro ? S.registro.sessione_id : null;
    if (!modalitaAula() || !sid) { el.hidden = true; return; }
    var st = Archivio.statoInvio().stato;
    var chiave = Archivio.partitaInviata(sid) ? 'ok' : st === 'in_coda' ? 'coda' : 'attesa';
    el.textContent = T({ ok: 'invio_ok', coda: 'invio_coda', attesa: 'invio_corso' }[chiave]);
    el.className = 'piccolo r-invio ' + chiave;
    el.dataset.stato = chiave;
    el.hidden = false;
  }
  window.addEventListener('quiz-invio', function () {
    if (schermataAttiva() === 'risultato') aggiornaRigaInvio();
  });
  /* Chiudere la pagina con una partita finita ma non ancora arrivata al server
     vorrebbe dire perderla: il browser chiede conferma (sui PC; sui telefoni
     non sempre). Al ritorno sulla pagina l'invio riparte da solo. */
  window.addEventListener('beforeunload', function (e) {
    if (Archivio.invioInSospeso()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* La dimensione delle schede si MISURA invece di stimarla in CSS: si guarda
     quanto spazio resta davvero sotto la testata, tolta la nota finale, e lo si
     divide per il numero di righe. Con costanti fisse bastava cambiare il
     numero di immagini per far finire la nota fuori dallo schermo. */
  function adattaGriglia() {
    var griglia = $('#r-griglia'), nota = $('#r-nota');
    var n = griglia.children.length;
    if (!n) return;
    requestAnimationFrame(function () {
      // telefono in verticale: due colonne e la pagina scorre. Far stare tutte
      // le schede in uno schermo cosi' stretto le renderebbe francobolli.
      if (window.matchMedia && window.matchMedia('(orientation: portrait) and (max-width: 600px)').matches) {
        var lato2 = Math.floor(Math.min((griglia.clientWidth - 12) / 2 - 26, 210));
        griglia.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        griglia.style.setProperty('--mini', Math.max(lato2, 90) + 'px');
        return;
      }
      var scheda = griglia.children[0], img = scheda.querySelector('img');
      var extra = scheda.offsetHeight - img.offsetHeight;        // testo, bordi, riempimento
      var largo = griglia.clientWidth;
      var alto = window.innerHeight - griglia.getBoundingClientRect().top - nota.offsetHeight - 28;

      // si prova ogni numero di colonne e si tiene quello che rende le schede
      // piu' grandi: con 12 immagini sei colonne per due righe battono quattro
      // colonne per tre righe
      var meglio = { lato: 0, colonne: Math.min(4, n) };
      for (var c = Math.min(8, n); c >= 2; c--) {
        var righe = Math.ceil(n / c);
        var perLarghezza = (largo - 12 * (c - 1)) / c - 46;      // 46 = bordi e riempimento
        var perAltezza = (alto - 12 * (righe - 1)) / righe - extra;
        var lato = Math.floor(Math.min(perLarghezza, perAltezza, 210));
        if (lato > meglio.lato) meglio = { lato: lato, colonne: c };
      }
      if (meglio.lato < 70) meglio.lato = 70;                    // sotto non si vede nulla: si scorre
      griglia.style.gridTemplateColumns = 'repeat(' + meglio.colonne + ', minmax(0, 1fr))';
      griglia.style.setProperty('--mini', meglio.lato + 'px');
    });
  }
  window.addEventListener('resize', function () {
    if (schermataAttiva() === 'risultato') adattaGriglia();
  });

  /* «Gioca ancora»: stesso partecipante, nuova partita, autore diverso e
     immagini mai viste da lui. La partita appena finita resta salvata. */
  function giocaAncora() {
    var finita = S;
    S = null;
    registraUscita(finita, 'gioca_ancora');     // le scritture su disco sono in fila
    iniziaPartita();
  }

  /* Uscita da una partita GIA' completata: si registra cosa ha fatto la persona
     dopo aver visto il risultato e per quanto tempo l'ha guardato (e' la dose di
     feedback prima della partita successiva). Si riscrive su disco solo con
     server o cartella: in modalita' download un secondo file per la stessa
     partita sarebbe solo rumore, e l'informazione arriva col file successivo. */
  async function registraUscita(partita, azione) {
    if (!partita || !partita.completata || partita.registro.azione_finale) return;
    partita.registro.azione_finale = azione;
    partita.registro.tempo_risultato_ms = partita.risultatoDa ? Math.round(ora() - partita.risultatoDa) : '';
    try { await Archivio.salvaSessione(partita.registro); } catch (e) { avviso('Errore di salvataggio'); }
    await chiudiSuDisco(partita.registro.sessione_id, { senzaDownload: true });
  }

  /* Ogni partita conclusa finisce SUBITO su disco, senza aspettare che qualcuno
     prema Esporta: il file della partita e quello cumulativo. Se l'operatore non
     ha collegato la cartella si puo' chiedere in alternativa lo scaricamento
     automatico (impostazione «un file a ogni partita»). */
  async function chiudiSuDisco(sessioneId, opzioni) {
    opzioni = opzioni || {};
    Archivio.partitaFinita(sessioneId);       // da qui in poi si puo' inviare
    var esito = await Archivio.salvaSuDisco(sessioneId, Archivio.leggiImpostazione('postazione', 'postazione-1'));
    if (modalitaAula()) {
      // In aula l'invio lo gestisce l'archivio, che riprova da solo finche' non
      // riesce, e i dati restano comunque nel dispositivo. Nessun allarme rosso:
      // al partecipante basta la riga di stato sulla schermata del risultato
      // (aggiornaRigaInvio), il dettaglio sta nel pannello operatore.
      avviso('');
      return;
    }
    if (esito === 'server' || esito === 'cartella') { avviso(''); return; }
    var stato = await Archivio.statoCartella();
    if (esito === 'errore') {
      avviso(Archivio.serverAttivo()
        ? 'Salvataggio su disco non riuscito: i dati restano nell\'app, chiama chi gestisce la postazione'
        : 'Cartella risultati non scritta: i dati restano salvati nell\'app');
      // se il server o la cartella falliscono si ripiega sul download, cosi' la
      // partita finisce comunque su disco
    }
    if (opzioni.senzaDownload) return;
    // senza cartella il file viene scaricato da solo a ogni partita: il
    // partecipante non tocca nulla, e i dati non restano solo dentro il browser
    if (Archivio.leggiImpostazione('scarica_ogni_partita', true)) {
      try { await Archivio.esporta(Archivio.leggiImpostazione('postazione', 'postazione-1'), {}); }
      catch (e) { avviso('Salvataggio del file non riuscito: i dati restano nell\'app'); }
      return;
    }
    avvisoCartella(stato);
  }

  /* Promemoria per l'operatore: senza cartella collegata i dati restano solo
     dentro il browser, ed e' la situazione in cui si perde tutto per sbaglio. */
  function avvisoCartella(stato) {
    if (!Archivio.cartellaSupportata()) {
      avviso('Nessuna cartella collegata: i dati sono solo nell\'app, ricordati di esportare');
      return;
    }
    avviso(stato === 'da_riconfermare'
      ? 'TOCCA QUI per ricollegare la cartella dei risultati'
      : 'TOCCA QUI per scegliere la cartella dove salvare i risultati',
      async function () {
        try {
          if (stato === 'da_riconfermare') await Archivio.riconfermaCartella();
          else await Archivio.collegaCartella();
        } catch (e) { /* scelta annullata: l'avviso resta */ }
        var adesso = await Archivio.statoCartella();
        if (adesso === 'collegata') {
          await Archivio.salvaSuDisco();
          avviso('');
        } else {
          avvisoCartella(adesso);
        }
      });
  }

  /* Chiusura unica per ogni motivo. Una sessione gia' completata non viene
     declassata a 'inattivita' se la persona si allontana dal risultato. */
  /* Si torna SUBITO alla schermata iniziale e il salvataggio prosegue: prima
     l'attesa del disco ritardava il ritorno, e se nel frattempo l'operatore
     apriva il pannello, il ritorno all'avvio glielo richiudeva. */
  async function concludi(motivo) {
    clearTimeout(timerInattivita);
    var sess = S;
    var dove = schermataAttiva();
    S = null;
    vaiAvvio();
    if (!sess) return;
    if (sess.completata) {
      // dal risultato: «Ho finito» (motivo 'completata'), inattivita' o operatore
      await registraUscita(sess, motivo === 'completata' ? 'ho_finito' : motivo);
      return;
    }
    sess.registro.fine = motivo;
    sess.registro.ultima_schermata = dove;
    Object.assign(sess.registro, riepilogoPartita(sess));
    try { await Archivio.salvaSessione(sess.registro); } catch (e) { avviso('Errore di salvataggio'); }
    await chiudiSuDisco(sess.registro.sessione_id);
  }

  /* ── ingrandimento ────────────────────────────────────────────────────── */
  /* Il limite dipende dalla RISOLUZIONE VERA del file (DATI.lato px): oltre
     circa una volta e mezza si ingrandirebbero solo i pixel, senza mostrare un
     dettaglio in piu', e su uno schermo grande si vedrebbe sgranato. */
  function impostaLimiteZoom() {
    var lato = (DATI.lato || 448) * INGRANDIMENTO_MAX;
    document.documentElement.style.setProperty('--zoom-max', Math.round(lato) + 'px');
  }

  var zoomDa = 0;
  function apriZoom(src, el) {
    if (P) P.haIngrandito = true;
    $('#p-suggerimento').hidden = true;
    $('#zoom-immagine').src = src;
    $('#zoom').hidden = false;
    zoomDa = ora();
    if (S && S.corrente && schermataAttiva() === 'prova') {
      S.corrente.zoom++;
      if (el && el.id === 'p-immagine') S.corrente.zoomStimolo++;
      else S.corrente.zoomRiferimenti++;
    }
  }
  function chiudiZoom() {
    if ($('#zoom').hidden) return;
    $('#zoom').hidden = true;
    if (S && S.corrente && zoomDa) S.corrente.tempoZoom += ora() - zoomDa;
    zoomDa = 0;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-zoom]');
    if (el && !el.hidden && $('#zoom').hidden) apriZoom(el.dataset.zoom, el);
  });
  $('#zoom').addEventListener('click', chiudiZoom);
  // la lente dell'immagine da giudicare sta sulla cornice: toccarla equivale
  // a toccare l'immagine (stesso conteggio in zoom_stimolo)
  $('#p-lente').addEventListener('click', function () { $('#p-immagine').click(); });   // la X sta dentro, quindi chiude anch'essa

  function chiudiSovrapposti() {
    chiudiZoom();
    $('#operatore').hidden = true;
    $('#impostazioni').hidden = true;
  }

  /* ── impostazioni: rotellina nella schermata iniziale ─────────────────── */
  function aggiornaImpostazioni() {
    var n = immaginiPerPartita();
    var comp = Sessione.composizione(n, statoLetto().sessioni || 0);
    $$('#imp-immagini .scelta').forEach(function (b) {
      b.classList.toggle('selezionata', +b.dataset.valore === n);
    });
    var scarica = Archivio.leggiImpostazione('scarica_ogni_partita', true) ? '1' : '0';
    $$('#imp-salvataggio .scelta').forEach(function (b) {
      b.classList.toggle('selezionata', b.dataset.salva === scarica);
    });
    $('#imp-dettaglio').textContent =
      comp.autentico + ' autentiche, ' + comp.copia + ' copie a mano, ' + comp.ai + ' fatte con AI · '
      + Sessione.numeroControlli(n) + ' controlli di attenzione · circa '
      + Math.round((n + Sessione.numeroControlli(n)) * 8 / 6) / 10 + ' minuti a partita';
  }
  function apriImpostazioni() {
    chiudiZoom();
    aggiornaImpostazioni();
    $('#impostazioni').hidden = false;
    azzeraInattivita();
  }

  /* ── pannello operatore ───────────────────────────────────────────────── */
  var timerOperatore = null;
  $('#angolo').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    clearTimeout(timerOperatore);
    timerOperatore = setTimeout(apriOperatore, PRESSIONE_OPERATORE_MS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    $('#angolo').addEventListener(ev, function () { clearTimeout(timerOperatore); });
  });
  $('#angolo').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // su PC anche da tastiera, mai raggiungibile per caso durante il gioco
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); apriOperatore(); }
  });

  async function aggiornaOperatore() {
    var r = await Archivio.riepilogo();
    var persistente = '?';
    try { if (navigator.storage && navigator.storage.persisted) persistente = (await navigator.storage.persisted()) ? 'sì' : 'no'; }
    catch (e) { /* non disponibile */ }
    var cartella = { non_supportata: 'non disponibile su questo browser (usare Esporta)',
                     assente: 'non collegata', da_riconfermare: 'da riconfermare (toccare il pulsante)',
                     collegata: 'collegata' }[r.cartella];
    var stato = statoLetto();
    var dove = r.aula
      ? 'invio al server dei risultati (' + (r.remoto ? 'raggiungibile' : 'NON raggiungibile') + ')'
      : r.server ? 'automatico in app/risultati (server locale)'
      : r.cartella === 'collegata' ? 'cartella collegata' : 'NESSUNO, solo dentro l\'app';
    $('#op-stato').textContent =
      'Versione app ' + VERSIONE.app + ' · pool ' + DATI.versione_pool + '\n' +
      'Immagini per partita: ' + immaginiPerPartita() + '\n' +
      'Salvataggio: ' + dove + '\n' +
      'Archivio: ' + r.archivio + ' · memoria persistente: ' + persistente + '\n' +
      'Partite salvate: ' + r.sessioni + ' (complete ' + r.complete + ')\n' +
      'Partite NON esportate: ' + r.non_esportate + '\n' +
      'Risposte salvate: ' + r.risposte + '\n' +
      'Autori non ancora estratti in questo giro: ' + ((stato.sacchetto || []).length) + '\n' +
      (r.aula
        // In aula quello che conta e' UNA cosa: le partite di questo dispositivo
        // sono arrivate al server? Il resto (cartella, disco) qui non esiste.
        ? 'Modalita\' aula: attiva · dispositivo ' + Archivio.leggiImpostazione('postazione', '?') + '\n' +
          'File dei risultati: ' + r.invio.file +
          (r.invio.sessioni === null ? '' : ' · ' + r.invio.sessioni + ' partite sul server') + '\n' +
          'Ultimo invio: ' + (r.invio.ultimo
            ? oraBreve(r.invio.ultimo) + (r.invio.errore ? ' NON riuscito (' + r.invio.errore + ')' : ' riuscito')
            : 'mai') + '\n' +
          (r.invio.stato === 'in_coda'
            ? '  In attesa di inviare: si riprova da solo, e i dati sono comunque dentro questo dispositivo\n'
            : '') +
          // la partita in corso non e' ancora stata inviata, ed e' giusto cosi'
          (r.invio.sessioni !== null && r.invio.sessioni < r.sessioni - (S ? 1 : 0)
            ? '  ATTENZIONE: sul server ci sono meno partite di quelle finite qui ('
              + r.invio.sessioni + ' contro ' + (r.sessioni - (S ? 1 : 0)) + ')\n'
            : '')
        : 'Cartella risultati: ' + cartella +
          (r.cartella === 'collegata' ? '' : '\n  ATTENZIONE: nessun file viene scritto su disco, '
            + 'i dati restano nell\'app finche\' non premi Esporta') + '\n') +
      (r.errore_cartella ? 'Ultimo errore di salvataggio: ' + r.errore_cartella + '\n' : '') +
      'Partita in corso: ' + (S ? 'sì' : 'no');
    $('#op-condividi').hidden = !Archivio.condivisioneSupportata();
    var btn = $('#op-cartella');
    btn.hidden = r.aula || r.cartella === 'non_supportata';
    btn.textContent = r.cartella === 'da_riconfermare' ? 'Riconferma cartella risultati'
      : r.cartella === 'collegata' ? 'Cambia cartella risultati' : 'Collega cartella risultati';
    btn.dataset.stato = r.cartella;
    // in aula si puo' chiedere l'invio subito, e non c'e' niente da chiudere
    $('#op-invia').hidden = !r.aula;
    $('#op-esci').hidden = r.aula;
  }

  function apriOperatore() {
    chiudiZoom();
    $('#impostazioni').hidden = true;
    $('#op-postazione').value = Archivio.leggiImpostazione('postazione', 'postazione-1');
    $('#op-esito').textContent = '';
    $('#operatore').hidden = false;
    aggiornaOperatore();
  }

  $('#op-postazione').addEventListener('change', function () {
    var v = Archivio.nomeSicuro(this.value.trim()) || 'postazione-1';
    this.value = v;
    Archivio.scriviImpostazione('postazione', v);
    $('#op-esito').textContent = 'Nome postazione salvato: ' + v;
  });
  async function esporta(condividi) {
    $('#op-esito').textContent = 'Esportazione…';
    try {
      var r = await Archivio.esporta(Archivio.leggiImpostazione('postazione', 'postazione-1'),
                                     { condividi: condividi });
      $('#op-esito').textContent = r.annullata ? 'Condivisione annullata: i dati sono ancora qui'
        : !r.n ? 'Niente da esportare'
        : 'Esportate ' + r.n + ' partite (' + r.righe + ' righe) nel file ' + r.nome
          + (r.dove === 'scaricato' ? '. Lo trovi nella cartella Download del browser.' : '.');
    } catch (e) { $('#op-esito').textContent = 'Esportazione non riuscita: ' + (e && e.message); }
    aggiornaOperatore();
  }
  $('#op-esporta').addEventListener('click', function () { esporta(false); });
  $('#op-condividi').addEventListener('click', function () { esporta(true); });
  $('#op-cartella').addEventListener('click', async function () {
    try {
      if (this.dataset.stato === 'da_riconfermare') await Archivio.riconfermaCartella();
      else await Archivio.collegaCartella();
      $('#op-esito').textContent = 'Cartella: ' + (await Archivio.statoCartella());
      avviso('');
    } catch (e) {
      $('#op-esito').textContent = e && e.name === 'AbortError' ? 'Scelta annullata' : 'Cartella non collegata: ' + (e && e.message);
    }
    aggiornaOperatore();
  });
  $('#op-invia').addEventListener('click', async function () {
    this.disabled = true;
    $('#op-esito').textContent = 'Invio in corso…';
    var esito = await Archivio.salvaSuDisco();
    this.disabled = false;
    var s = Archivio.statoInvio();
    $('#op-esito').textContent = esito === 'remoto'
      ? 'Inviate al server' + (s.sessioni === null ? '' : ' · ' + s.sessioni + ' partite di questo dispositivo')
      : 'Invio non riuscito (' + (s.errore || 'errore') + '): i dati restano qui e si riprova da solo';
    aggiornaOperatore();
  });
  $('#op-chiudi-sessione').addEventListener('click', function () {
    if (!S) { $('#op-esito').textContent = 'Nessuna partita in corso'; return; }
    if (!confirm('Chiudere la partita in corso? Le risposte già date restano salvate.')) return;
    concludi('operatore');
  });
  /* Chiude il quiz. Con il mini server (AVVIA.bat) e' il server a chiudere Edge
     e poi se stesso, dopo che tutto e' stato scritto su disco: in modalita'
     chiosco una pagina non puo' chiudere la propria finestra. Senza server si
     prova window.close(), che il browser consente solo per finestre aperte da
     script: se rifiuta, si spiega la scorciatoia. */
  async function esciDalQuiz() {
    if (!confirm('Chiudere il quiz? I dati restano salvati.')) return;
    if (S) { await concludi('operatore'); }
    if (Archivio.serverAttivo()) {
      var esito = await Archivio.salvaSuDisco();
      if (esito !== 'server'
          && !confirm('Il salvataggio su disco non è riuscito. Chiudere lo stesso? I dati restano nel browser.')) return;
      if (await Archivio.chiediUscita()) {
        $('#operatore').hidden = true;
        avviso('Quiz chiuso: i risultati sono in app\\risultati. Si può spegnere il PC.');
        return;
      }
    } else {
      var r = await Archivio.riepilogo();
      if (r.non_esportate && r.cartella !== 'collegata'
          && !confirm('Ci sono ' + r.non_esportate + ' partite non ancora esportate. Chiudere lo stesso?')) return;
    }
    window.close();
    setTimeout(function () {
      var msg = 'Il browser non lascia chiudere la finestra da qui: usa Alt+F4.';
      $('#op-esito').textContent = msg;
      avviso(msg);
    }, 300);
  }
  $('#op-esci').addEventListener('click', esciDalQuiz);

  $('#op-chiudi').addEventListener('click', function () { $('#operatore').hidden = true; });

  /* ── collegamenti ─────────────────────────────────────────────────────── */
  function collega() {
    $('#btn-avvia').addEventListener('click', nuovoPartecipante);
    collegaScelte('#istruzioni', scelteConsenso, function () {
      $('#btn-inizia').disabled = !(scelteConsenso.gia_giocato && scelteConsenso.minorenne);
    });
    $('#btn-inizia').addEventListener('click', function () {
      this.disabled = true;
      P.consenso = { gia_giocato: scelteConsenso.gia_giocato, minorenne: scelteConsenso.minorenne };
      P.tempoIstruzioni = Math.round(ora() - P.istruzioniDa);
      iniziaPartita();
    });
    $('#btn-riferimenti').addEventListener('click', iniziaProve);
    $$('.risposta').forEach(function (b) {
      b.addEventListener('click', function (e) { rispondi(b.dataset.risposta, e); });
    });
    collegaScelte('#domande', scelteDomande, function () {
      // appena una domanda evidenziata riceve risposta, l'evidenza sparisce
      if (!$('#dom-manca').hidden) evidenziaMancanti();
    });
    $('#btn-domande').addEventListener('click', function () { this.disabled = true; confermaDomande(); });
    $('#btn-ancora').addEventListener('click', function () { this.disabled = true; giocaAncora(); });
    $('#btn-fine').addEventListener('click', function () { concludi('completata'); });

    $('#rotella').addEventListener('click', apriImpostazioni);
    $('#lingua').addEventListener('click', cambiaLingua);
    $('#esci').addEventListener('click', esciDalQuiz);
    $$('#imp-immagini .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        Archivio.scriviImpostazione('immagini', +b.dataset.valore);
        aggiornaImpostazioni();
      });
    });
    $$('#imp-salvataggio .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        Archivio.scriviImpostazione('scarica_ogni_partita', b.dataset.salva === '1');
        aggiornaImpostazioni();
      });
    });
    $('#imp-chiudi').addEventListener('click', function () { $('#impostazioni').hidden = true; });
    $('#impostazioni').addEventListener('click', function (e) {
      if (e.target.id === 'impostazioni') $('#impostazioni').hidden = true;
    });
    document.addEventListener('contextmenu', function (e) {
      if (e.target.tagName === 'IMG') e.preventDefault();
    });

    $('#es-autentico').src = DATI.esempi.autentico;
    $('#es-copia').src = DATI.esempi.copia;
    $('#es-ai').src = DATI.esempi.ai;
  }

  async function avvia() {
    if (!DATI || !window.TESTI || !window.Sessione || !window.Archivio || !window.REMOTO) {
      document.body.innerHTML = '<p style="padding:40px;font-size:22px">Dati del quiz mancanti: '
        + 'eseguire demo/quiz_offline/prepara_quiz.py e riaprire la pagina.</p>';
      return;
    }
    window.addEventListener('error', function () { avviso('Errore imprevisto: chiamare chi gestisce la postazione'); });

    await Archivio.cercaServer();
    await Archivio.cercaRemoto();       // modalita' aula: c'e' il server dei risultati?
    var tipo = await Archivio.apri();
    if (tipo !== 'indexeddb') avviso('Archivio ridotto (localStorage): esportare spesso');
    await Archivio.caricaCartella();
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); }
    catch (e) { /* non disponibile, non critico */ }

    impostaLimiteZoom();
    preparaAula();                  // nome unico del dispositivo, niente download a ogni partita
    lingua = linguaSalvata();       // la scelta fatta la volta prima, se c'e'
    collega();
    applicaTesti();                 // tutte le scritte nella lingua scelta
    vaiAvvio();
    // stato del salvataggio subito all'apertura: se manca, l'operatore lo vede
    // prima che arrivi il primo partecipante
    if (modalitaAula() || Archivio.serverAttivo()) {
      // se una partita era rimasta a meta' (browser chiuso, PC spento, wifi
      // caduto) o un salvataggio era fallito, il file riscritto ora la recupera
      await Archivio.salvaSuDisco();
    } else {
      var statoCart = await Archivio.statoCartella();
      if (statoCart === 'collegata') await Archivio.salvaSuDisco();
      else avvisoCartella(statoCart);
    }
    document.body.dataset.pronta = '1';        // segnale per i test automatici
  }

  avvia();
})();
