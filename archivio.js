/* ==========================================================================
   ARCHIVIO: salvataggio, esportazione, cartella dei risultati

   TRE LIVELLI, perche' nessun giudizio vada perso
   1. Archivio interno (IndexedDB), scritto a OGNI risposta. Se IndexedDB non
      e' disponibile si ripiega su localStorage, con la stessa interfaccia.
   2. Cartella dei risultati (solo Edge/Chrome su PC): un CSV per sessione,
      riscritto per intero a ogni risposta. Se la scrittura fallisce i dati
      restano comunque nel livello 1.
   3. Esportazione manuale di tutte le sessioni in un unico CSV.

   PIU' PARTITE, STESSA PERSONA
   Ogni partita e' una riga di sessione a se'; le partite della stessa persona
   condividono `partecipante_id`. L'analisi puo' quindi trattare la persona come
   effetto casuale invece di contare ogni partita come un individuo diverso.

   UNA RIGA NASCE QUANDO LA PROVA VIENE MOSTRATA, non quando arriva la risposta:
   chi abbandona a meta' lascia righe con risposta vuota, e quelle servono a
   distinguere l'abbandono dalla mancata comparsa.

   ANONIMATO FIN DALL'ORIGINE
   Nessun orario al secondo: solo data e ora di inizio arrotondata ai 15 minuti,
   piu' i tempi relativi. `creata_ms` serve solo a ordinare le sessioni e non
   viene mai esportato.
   ========================================================================== */
'use strict';

var Archivio = (function () {

  var NOME_DB = 'quiz_shikishi';
  var server = false;              // l'app e' servita dal mini server locale?
  var db = null;
  var tipo = 'nessuno';            // 'indexeddb' | 'localstorage'
  var cartella = null;             // FileSystemDirectoryHandle
  var ultimoErroreCartella = null;
  var ultimaScritturaCartella = null;
  // modalita' aula (sito pubblico + server dei risultati): vedi remoto.js
  var remoto = false;              // il server dei risultati risponde?
  var invio = { stato: 'spento', ultimo: null, errore: null, sessioni: null };
  var timerRitentativo = null;
  var tentativiInvio = 0;

  var COLONNE_SESSIONE = [
    'sessione_id', 'partecipante_id', 'partita', 'postazione', 'versione_app', 'versione_pool',
    'data', 'ora_inizio_15min', 'seme', 'controlli', 'n_immagini', 'composizione',
    'gia_giocato', 'minorenne', 'fine',
    'risposto_a_caso', 'conosce_autore', 'eta', 'manga', 'disegno', 'visto_giocare',
    // aggiunte nella versione 1.2.0 (in coda: chi legge per nome non si accorge di nulla)
    'n_partita_dispositivo', 'azione_finale', 'ultima_schermata', 'tempo_istruzioni_ms',
    'durata_partita_ms', 'tempo_domande_ms', 'tempo_risultato_ms',
    'n_valutate', 'punteggio_umano', 'punteggio_umano_tipo', 'punteggio_modello', 'punteggio_modello_tipo',
    'controlli_risposti', 'controlli_superati',
    'schermo_css', 'dpr', 'tocco', 'puntatore', 'browser', 'sistema', 'salvataggio',
    // aggiunta nella versione 1.3.1: lingua dell'interfaccia durante la partita
    'lingua',
  ];
  var COLONNE_RIGA = [
    'indice', 'blocco', 'posizione', 'autore', 'fascia', 'tipo', 'controllo_richiesto',
    'image_uid', 'categoria', 'etichetta_vera', 'risposta', 'corretta', 'corretta_tipo',
    'rt_ms', 'input', 'zoom_aperture', 'tempo_zoom_ms', 'tempo_nascosto_ms',
    'tempo_riferimenti_ms', 'pred_modello', 'score_modello', 'tau', 'modello_corretto',
    'strato_margine', 'peso_campionamento', 'margin_rank_z',
    // aggiunte nella versione 1.2.0
    'autore_nome', 'risposta_testo', 'esito', 't_comparsa_ms', 't_risposta_ms',
    'posizione_stimolo', 'gia_vista', 'zoom_stimolo', 'zoom_riferimenti', 'lato_stimolo_px',
    'score_b1', 'score_b2', 'ramo_vincente', 'margine',
    'pred_modello_tipo', 'modello_corretto_tipo', 'esito_modello',
  ];
  var COLONNE = COLONNE_SESSIONE.concat(COLONNE_RIGA);

  /* ── mini server locale ───────────────────────────────────────────────── */
  /* Se l'app arriva da server.ps1 o server.py, i CSV si scrivono da soli in
     app/risultati: nessuno deve scegliere una cartella. Aperta con doppio clic
     (file://) questa strada non esiste, perche' il browser non lascia scrivere
     su disco, e allora si ripiega sulla cartella scelta a mano o sul
     file scaricato a ogni partita. */
  async function cercaServer() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    try {
      var r = await fetch('api/stato', { cache: 'no-store' });
      server = r.ok && (await r.json()).ok === true;
    } catch (e) { server = false; }
    return server;
  }
  function serverAttivo() { return server; }

  async function salvaSulServer(nome, testo) {
    if (!server) return false;
    try {
      var r = await fetch('api/salva', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome, contenuto: testo }),
      });
      var esito = r.ok && (await r.json()).ok === true;
      ultimoErroreCartella = esito ? null : 'server';
      if (esito) ultimaScritturaCartella = Date.now();
      return esito;
    } catch (e) {
      ultimoErroreCartella = 'server irraggiungibile';
      return false;
    }
  }

  /* ── server dei risultati, modalita' aula ─────────────────────────────────
     Su un sito pubblico non c'e' nessuna cartella da scegliere e nessun disco
     su cui scrivere: i risultati vanno a un piccolo server (aula/worker.js) che
     li committa su GitHub.

     UN FILE PER PARTITA (dalla 1.3.1): `<dispositivo>_<sessione>.csv`. Ogni
     file lo scrive un solo dispositivo e contiene una sola partita, quindi:
     - non serve leggere niente prima di scrivere (una chiamata invece di tre),
       e non esiste piu' il caso "letto male, riscritto male";
     - due studenti non toccano mai lo stesso file;
     - se la memoria del browser si svuota, le partite gia' inviate restano sul
       server, intatte, ognuna nel suo file.
     Una partita si rimanda solo se e' CAMBIATA dall'ultimo invio riuscito (per
     esempio quando si aggiunge cosa ha fatto la persona dopo il risultato): si
     confronta una firma del contenuto, ricordata nelle impostazioni.

     In aula le partite finiscono tutte nello stesso minuto e GitHub accetta un
     commit alla volta per ramo: il server riprova con attese casuali, e se
     GitHub chiede di rallentare risponde 503 con `riprova_fra`, che qui si
     rispetta. Le partite restano comunque nell'archivio del dispositivo finche'
     non arrivano.

     L'indirizzo sta in remoto.js. Non e' un segreto (chi legge il codice lo
     vede): il segreto e' il token di GitHub, che resta dentro il server. */
  function aulaConfigurata() {
    var r = window.REMOTO || {};
    return !!(r.endpoint && String(r.endpoint).replace(/\/+$/, ''));
  }
  function baseRemoto() { return String(window.REMOTO.endpoint).replace(/\/+$/, ''); }
  function remotoAttivo() { return remoto; }

  async function cercaRemoto() {
    if (!aulaConfigurata()) return false;
    // da disco (file://) non c'e' nessun server: la modalita' aula vale solo
    // per l'app servita da un sito
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    try {
      var r = await fetch(baseRemoto() + '/api/stato', { cache: 'no-store', headers: intestazioniRemoto() });
      remoto = r.ok && (await r.json()).ok === true;
    } catch (e) { remoto = false; }
    return remoto;
  }

  /* Il dispositivo: la postazione, che in aula e' un nome unico generato
     dall'app (vedi preparaAula() in app.js). Accorciata, perche' il nome del
     file non superi gli 80 caratteri ammessi dal server. */
  function nomeDispositivo() {
    return nomeSicuro(leggiImpostazione('postazione', 'postazione-1')).slice(0, 40);
  }
  function nomeRemoto(sessioneId) {
    return nomeDispositivo() + '_' + String(sessioneId).replace(/[^A-Za-z0-9]/g, '') + '.csv';
  }

  /* Intestazioni per il server dei risultati. Il codice d'aula e' facoltativo:
     se remoto.js non ne ha uno, non si manda niente in piu'. */
  function intestazioniRemoto(extra) {
    var h = Object.assign({}, extra || {});
    var c = (window.REMOTO || {}).codice;
    if (c) h['X-Codice-Aula'] = String(c);
    return h;
  }

  /* Firma del contenuto: lunghezza piu' un hash djb2. Basta a dire "e' cambiato
     dall'ultimo invio?", non deve essere crittografica. */
  function firma(testo) {
    var h = 5381;
    for (var i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) | 0;
    return testo.length + ':' + (h >>> 0).toString(36);
  }

  /* Partite inviate: { sessione_id: firma dell'ultimo contenuto arrivato }. */
  function inviate() {
    var v = leggiImpostazione('inviate', {});
    return v && typeof v === 'object' ? v : {};
  }

  /* La partita in corso non si manda a meta': arriva quando finisce. Una
     partita rimasta a meta' (pagina chiusa) parte invece alla riapertura,
     quando non e' piu' "in corso". */
  var partitaInCorso = null;
  function segnaPartitaInCorso(sessioneId) { partitaInCorso = sessioneId || null; }
  function partitaFinita(sessioneId) { if (partitaInCorso === sessioneId) partitaInCorso = null; }

  /* Avvisa l'interfaccia che lo stato dell'invio e' cambiato (riga di stato
     sulla schermata del risultato, pannello operatore). */
  var inSospeso = false;
  function notifica() {
    scriviImpostazione('invio', invio);
    try { window.dispatchEvent(new CustomEvent('quiz-invio', { detail: statoInvio() })); } catch (e) { /* vecchi browser */ }
  }

  /* Un invio. Restituisce true, oppure lancia un errore con `riprovaFra` (ms)
     se il server ha detto quanto aspettare. */
  async function inviaRemoto(nome, testo) {
    var r = await fetch(baseRemoto() + '/api/salva', {
      method: 'POST', headers: intestazioniRemoto({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nome: nome, contenuto: testo, versione: (window.VERSIONE || {}).app || '' }),
    });
    var esito = {};
    try { esito = await r.json(); } catch (e) { /* risposta non leggibile */ }
    if (r.ok && esito.ok === true) return true;
    var err = new Error(esito.errore || ('risposta ' + r.status));
    if (esito.riprova_fra) err.riprovaFra = Number(esito.riprova_fra) * 1000;
    throw err;
  }

  /* Manda tutte le partite nuove o cambiate, una alla volta (in parallelo si
     farebbero concorrenza da sole sullo stesso repository). Al primo errore si
     ferma e programma il ritentativo: le altre partite ripartono da li'. */
  async function inviaPartiteRemote() {
    var tutto = await leggiTutto();
    var righe = righePiatte(tutto.sessioni, tutto.righe);
    var perPartita = {}, ordine = [];
    righe.forEach(function (r) {
      if (!(r.sessione_id in perPartita)) { perPartita[r.sessione_id] = []; ordine.push(r.sessione_id); }
      perPartita[r.sessione_id].push(r);
    });
    var fatte = inviate();
    var daInviare = ordine.filter(function (sid) {
      return sid !== partitaInCorso && fatte[sid] !== firma(csvDaRighe(COLONNE, perPartita[sid]));
    });
    if (!daInviare.length) {
      inSospeso = false;
      if (invio.stato !== 'inviato' && Object.keys(fatte).length) invio.stato = 'inviato';
      invio.sessioni = Object.keys(fatte).length;
      notifica();
      return true;
    }
    inSospeso = true;
    invio.stato = 'invio';
    notifica();
    for (var i = 0; i < daInviare.length; i++) {
      var sid = daInviare[i];
      var testo = csvDaRighe(COLONNE, perPartita[sid]);
      try {
        await inviaRemoto(nomeRemoto(sid), testo);
      } catch (e) {
        invio.stato = 'in_coda';
        invio.errore = (e && e.message) || 'server non raggiungibile';
        if (!(e && e.riprovaFra)) remoto = false;      // il prossimo tentativo lo riverifica
        notifica();
        programmaRitentativo(e && e.riprovaFra);
        return false;
      }
      fatte = inviate();
      fatte[sid] = firma(testo);
      scriviImpostazione('inviate', fatte);
    }
    inSospeso = false;
    invio.stato = 'inviato'; invio.ultimo = Date.now(); invio.errore = null;
    invio.sessioni = Object.keys(fatte).length;
    tentativiInvio = 0;
    annullaRitentativo();
    ultimaScritturaCartella = Date.now();
    notifica();
    return true;
  }

  /* Il ritentativo e' quello che salva la raccolta quando il wifi dell'aula va e
     viene o GitHub chiede di rallentare: le partite restano nell'archivio
     interno e si riprova da soli. Attesa crescente fino a un minuto, con una
     parte CASUALE: trenta dispositivi respinti nello stesso istante non devono
     ripresentarsi tutti insieme. */
  function annullaRitentativo() {
    if (timerRitentativo) { clearTimeout(timerRitentativo); timerRitentativo = null; }
  }
  function programmaRitentativo(attesaSuggerita) {
    if (timerRitentativo || !aulaConfigurata()) return;
    tentativiInvio++;
    var base = attesaSuggerita || Math.min(5000 * Math.pow(2, Math.min(tentativiInvio - 1, 4)), 60000);
    var attesa = Math.round(base * (0.75 + Math.random() * 0.5));
    timerRitentativo = setTimeout(function () {
      timerRitentativo = null;
      salvaSuDisco();
    }, attesa);
  }

  function statoInvio() {
    return {
      stato: invio.stato, ultimo: invio.ultimo, errore: invio.errore,
      sessioni: invio.sessioni, file: aulaConfigurata() ? nomeDispositivo() + '_<partita>.csv' : '',
    };
  }
  /* Per la riga di stato sulla schermata del risultato: questa partita e' sul
     server? (Basta una versione: gli aggiornamenti successivi sono dettagli.) */
  function partitaInviata(sessioneId) { return !!inviate()[sessioneId]; }
  /* C'e' una partita finita che non e' ancora arrivata al server? */
  function invioInSospeso() { return aulaConfigurata() && inSospeso; }

  /* Ultimo esito dell'invio, ricordato fra un caricamento e l'altro: il pannello
     operatore deve poterlo dire subito, senza aspettare il primo tentativo. */
  (function ricordaUltimoInvio() {
    var v = leggiImpostazione('invio', null);
    if (!v || typeof v !== 'object') return;
    invio.ultimo = v.ultimo || null;
    invio.errore = v.errore || null;
    invio.sessioni = v.sessioni === undefined ? null : v.sessioni;
  })();

  /* Quando la rete torna, o quando si riapre la pagina dopo averla lasciata in
     secondo piano, si riprova SUBITO senza aspettare il timer. */
  window.addEventListener('online', function () { if (aulaConfigurata()) salvaSuDisco(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && invio.stato === 'in_coda') { annullaRitentativo(); salvaSuDisco(); }
  });

  /* ── apertura ─────────────────────────────────────────────────────────── */
  function apri() {
    return new Promise(function (risolvi) {
      var ripiega = function () { tipo = 'localstorage'; risolvi(tipo); };
      try {
        if (!window.indexedDB) return ripiega();
        var rq = indexedDB.open(NOME_DB, 1);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          d.createObjectStore('sessioni', { keyPath: 'sessione_id' });
          d.createObjectStore('righe', { keyPath: 'chiave' });
          d.createObjectStore('impostazioni', { keyPath: 'k' });
        };
        rq.onsuccess = function () { db = rq.result; tipo = 'indexeddb'; risolvi(tipo); };
        rq.onerror = ripiega;
        rq.onblocked = ripiega;
      } catch (e) { ripiega(); }
    });
  }

  /* ── primitive, identiche per i due archivi ──────────────────────────── */
  function lsLeggi(nome) {
    try { return JSON.parse(localStorage.getItem('quiz_' + nome) || '{}'); } catch (e) { return {}; }
  }
  function lsScrivi(nome, v) {
    localStorage.setItem('quiz_' + nome, JSON.stringify(v));   // se fallisce, l'errore sale
  }

  function metti(store, obj, chiave) {
    if (tipo === 'indexeddb') {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(obj);
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error); };
      });
    }
    return new Promise(function (ok) {
      var m = lsLeggi(store); m[obj[chiave]] = obj; lsScrivi(store, m); ok();
    });
  }
  function prendiTutti(store) {
    if (tipo === 'indexeddb') {
      return new Promise(function (ok, ko) {
        var rq = db.transaction(store, 'readonly').objectStore(store).getAll();
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { ko(rq.error); };
      });
    }
    var m = lsLeggi(store);
    return Promise.resolve(Object.keys(m).map(function (k) { return m[k]; }));
  }
  function prendi(store, chiave) {
    if (tipo === 'indexeddb') {
      return new Promise(function (ok, ko) {
        var rq = db.transaction(store, 'readonly').objectStore(store).get(chiave);
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { ko(rq.error); };
      });
    }
    return Promise.resolve(lsLeggi(store)[chiave]);
  }

  /* ── sessioni e righe ─────────────────────────────────────────────────── */
  function salvaSessione(s) { return metti('sessioni', s, 'sessione_id'); }

  function salvaRiga(r) {
    r.chiave = r.sessione_id + '|' + String(r.indice).padStart(3, '0');
    return metti('righe', r, 'chiave');
  }

  function leggiTutto() {
    return Promise.all([prendiTutti('sessioni'), prendiTutti('righe')]).then(function (v) {
      return { sessioni: v[0], righe: v[1] };
    });
  }

  /* ── impostazioni leggere del dispositivo (localStorage) ─────────────── */
  function leggiImpostazione(k, def) {
    try { var v = localStorage.getItem('quiz_imp_' + k); return v === null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function scriviImpostazione(k, v) {
    try { localStorage.setItem('quiz_imp_' + k, JSON.stringify(v)); } catch (e) { /* non critico */ }
  }

  /* ── CSV ──────────────────────────────────────────────────────────────── */
  function campo(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* Righe "piatte" (una per schermata, colonne di partita ripetute) nell'ordine
     del CSV: servono sia all'esportazione sia all'unione col file su disco. */
  function righePiatte(sessioni, righe) {
    var perId = {};
    sessioni.forEach(function (s) { perId[s.sessione_id] = s; });
    return righe.filter(function (r) { return perId[r.sessione_id]; }).sort(function (a, b) {
      var sa = perId[a.sessione_id], sb = perId[b.sessione_id];
      return (sa.creata_ms - sb.creata_ms) || a.sessione_id.localeCompare(b.sessione_id)
             || (a.indice - b.indice);
    }).map(function (r) {
      var s = perId[r.sessione_id], o = {};
      COLONNE_SESSIONE.forEach(function (c) { o[c] = s[c] === undefined || s[c] === null ? '' : String(s[c]); });
      COLONNE_RIGA.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : String(r[c]); });
      return o;
    });
  }

  function csvDaRighe(colonne, righe) {
    var linee = [colonne.join(',')];
    righe.forEach(function (r) {
      linee.push(colonne.map(function (c) { return campo(r[c]); }).join(','));
    });
    return linee.join('\r\n') + '\r\n';
  }

  function csv(sessioni, righe) { return csvDaRighe(COLONNE, righePiatte(sessioni, righe)); }

  /* Lettore CSV (virgolette, virgole e a capo dentro i campi). */
  function leggiCsv(testo) {
    testo = String(testo || '').replace(/^\uFEFF/, '');
    var righe = [], riga = [], campoCorrente = '', tra = false;
    for (var i = 0; i < testo.length; i++) {
      var c = testo[i];
      if (tra) {
        if (c === '"') {
          if (testo[i + 1] === '"') { campoCorrente += '"'; i++; } else tra = false;
        } else campoCorrente += c;
      } else if (c === '"') tra = true;
      else if (c === ',') { riga.push(campoCorrente); campoCorrente = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && testo[i + 1] === '\n') i++;
        riga.push(campoCorrente); righe.push(riga); riga = []; campoCorrente = '';
      } else campoCorrente += c;
    }
    if (campoCorrente !== '' || riga.length) { riga.push(campoCorrente); righe.push(riga); }
    righe = righe.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
    if (!righe.length) return { colonne: [], righe: [] };
    var colonne = righe[0];
    return {
      colonne: colonne,
      righe: righe.slice(1).map(function (r) {
        var o = {};
        colonne.forEach(function (c, j) { o[c] = r[j] === undefined ? '' : r[j]; });
        return o;
      }),
    };
  }

  function timbro() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function nomeSicuro(s) { return String(s || 'postazione').replace(/[^A-Za-z0-9_-]+/g, '_'); }

  /* ── esportazione ─────────────────────────────────────────────────────── */
  function scarica(nome, testo) {
    var blob = new Blob([testo], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  /* L'esportazione SCARICA sempre il file: e' l'unica strada che funziona
     ovunque, compreso Windows in modalita' chiosco. Il menu Condividi resta
     disponibile come pulsante separato, perche' su iPad e' il modo comodo per
     mandare il file in File o via AirDrop.

     Prima si sceglieva da soli in base al tipo di puntatore, e su un PC Windows
     con schermo tattile partiva il menu Condividi: se non compariva o veniva
     chiuso, non si salvava niente. */
  async function esporta(postazione, opzioni) {
    var tutto = await leggiTutto();
    if (!tutto.righe.length) return { n: 0 };
    // il numero di partite nel nome evita che due file dello stesso minuto si
    // chiamino uguale e diventino «(1)», «(2)» nella cartella Download
    var nome = 'quiz_' + nomeSicuro(postazione) + '_' + timbro()
               + '_p' + String(tutto.sessioni.length).padStart(3, '0') + '.csv';
    var testo = csv(tutto.sessioni, tutto.righe);

    var condiviso = false;
    if ((opzioni || {}).condividi && condivisioneSupportata()) {
      var file = new File([testo], nome, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: nome }); condiviso = true; }
        catch (e) { if (e && e.name === 'AbortError') return { n: 0, annullata: true }; }
      }
    }
    if (!condiviso) scarica(nome, testo);
    var dove = condiviso ? 'condiviso' : 'scaricato';

    for (var i = 0; i < tutto.sessioni.length; i++) {
      if (!tutto.sessioni[i].esportata) {
        tutto.sessioni[i].esportata = 1;
        await salvaSessione(tutto.sessioni[i]);
      }
    }
    return { n: tutto.sessioni.length, righe: tutto.righe.length, nome: nome, dove: dove };
  }

  function condivisioneSupportata() {
    return !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.csv', { type: 'text/csv' })] }));
  }

  /* ── cartella dei risultati (File System Access, solo Chromium su PC) ── */
  function cartellaSupportata() {
    return typeof window.showDirectoryPicker === 'function' && tipo === 'indexeddb';
  }

  async function caricaCartella() {
    if (!cartellaSupportata()) return;
    try {
      var v = await prendi('impostazioni', 'cartella');
      if (v && v.v) cartella = v.v;
    } catch (e) { cartella = null; }
  }

  async function statoCartella() {
    if (!cartellaSupportata()) return 'non_supportata';
    if (!cartella) return 'assente';
    try {
      var p = await cartella.queryPermission({ mode: 'readwrite' });
      return p === 'granted' ? 'collegata' : 'da_riconfermare';
    } catch (e) { return 'da_riconfermare'; }
  }

  /* Da chiamare DENTRO un tocco o un clic: il browser chiede il permesso solo
     in risposta a un gesto dell'utente. */
  async function collegaCartella() {
    var h = await window.showDirectoryPicker({ id: 'quiz-risultati', mode: 'readwrite' });
    cartella = h;
    await metti('impostazioni', { k: 'cartella', v: h }, 'k');
    return statoCartella();
  }
  async function riconfermaCartella() {
    if (!cartella) return 'assente';
    await cartella.requestPermission({ mode: 'readwrite' });
    return statoCartella();
  }

  /* ── UN SOLO FILE SU DISCO, UNITO E MAI SOSTITUITO ──────────────────────
     Tutte le partite di tutti i partecipanti stanno in risultati/risultati.csv.
     Chi gioca piu' volte ha piu' partite con lo stesso partecipante_id.

     Il file NON si riscrive a partire dalla memoria del browser: prima si legge
     quello su disco, poi si aggiungono o aggiornano le righe che il browser
     conosce, e quelle che il browser non ha piu' restano dove sono. Senza
     questa unione, se la memoria del browser si svuotasse (dati di navigazione
     cancellati, cartella spostata) la partita successiva riscriverebbe il file
     solo con se stessa, cancellando dal disco tutte le precedenti.

     Chiave di una riga: sessione_id + indice. Vince la versione del browser,
     che e' la piu' recente (per esempio aggiunge l'azione finale). */
  var NOME_FILE = 'risultati.csv';
  var NOME_RIEPILOGO = 'riepilogo_partite.csv';

  /* Vista compatta, UNA RIGA PER PARTITA, da aprire in Excel. Si ricava ogni
     volta dal file completo gia' unito, quindi e' sempre allineata a
     risultati.csv e si puo' riscrivere da zero senza perdere nulla: la fonte
     resta il formato lungo. Stesse colonne di riassunto_partite.csv prodotto
     da analizza_risultati.py, tranne l'esclusione, che applica la regola
     dell'analisi e resta li'. */
  var COLONNE_RIEPILOGO = [
    'partecipante_id', 'partita', 'sessione_id', 'data', 'ora_inizio_15min',
    'autore', 'autore_nome', 'fascia', 'fine', 'azione_finale', 'immagini_giudicate',
    'autentiche_totali', 'autentiche_giuste',
    'copie_totali', 'copie_giuste', 'copie_tipo_esatto',
    'ai_totali', 'ai_giuste', 'ai_tipo_esatto',
    'giuste', 'tipo_esatto', 'accuratezza',
    'modello_autentiche_giuste', 'modello_copie_giuste', 'modello_ai_giuste',
    'modello_giuste', 'modello_tipo_esatto', 'modello_accuratezza',
    'controlli_superati', 'controlli_risposti', 'rt_mediano_ms',
    'risposto_a_caso', 'conosce_autore', 'eta', 'manga', 'disegno', 'gia_giocato', 'minorenne',
    'dopo_feedback',
  ];
  function righeRiepilogo(righe) {
    var perPartita = {}, ordine = [];
    righe.forEach(function (r) {
      if (!(r.sessione_id in perPartita)) { perPartita[r.sessione_id] = []; ordine.push(r.sessione_id); }
      perPartita[r.sessione_id].push(r);
    });
    var conta = function (v, f) { return v.filter(f).length; };
    var quota = function (a, b) { return b ? String(Number((a / b).toFixed(4))) : ''; };
    return ordine.map(function (sid) {
      var g = perPartita[sid], r0 = g[0];
      var stim = g.filter(function (r) { return r.tipo === 'stimolo' && r.risposta; });
      var ctrl = g.filter(function (r) { return r.tipo === 'controllo' && r.risposta; });
      var o = {};
      ['partecipante_id', 'partita', 'sessione_id', 'data', 'ora_inizio_15min', 'autore', 'autore_nome',
       'fascia', 'fine', 'azione_finale', 'risposto_a_caso', 'conosce_autore', 'eta', 'manga', 'disegno',
       'gia_giocato', 'minorenne'].forEach(function (c) { o[c] = r0[c] || ''; });
      o.immagini_giudicate = stim.length;
      [['autentico', 'autentiche'], ['copia', 'copie'], ['ai', 'ai']].forEach(function (cn) {
        var c = stim.filter(function (r) { return r.categoria === cn[0]; });
        o[cn[1] + '_totali'] = c.length;
        o[cn[1] + '_giuste'] = conta(c, function (r) { return r.corretta === '1'; });
        if (cn[0] !== 'autentico') o[cn[1] + '_tipo_esatto'] = conta(c, function (r) { return r.corretta_tipo === '1'; });
        o['modello_' + cn[1] + '_giuste'] = conta(c, function (r) { return r.modello_corretto === '1'; });
      });
      o.giuste = conta(stim, function (r) { return r.corretta === '1'; });
      o.tipo_esatto = conta(stim, function (r) { return r.corretta_tipo === '1'; });
      o.accuratezza = quota(o.giuste, stim.length);
      o.modello_giuste = conta(stim, function (r) { return r.modello_corretto === '1'; });
      o.modello_tipo_esatto = conta(stim, function (r) { return r.modello_corretto_tipo === '1'; });
      o.modello_accuratezza = quota(o.modello_giuste, stim.length);
      o.controlli_superati = conta(ctrl, function (r) { return r.corretta === '1'; });
      o.controlli_risposti = ctrl.length;
      var tempi = stim.map(function (r) { return Number(r.rt_ms); })
        .filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
      var m = tempi.length >> 1;
      o.rt_mediano_ms = tempi.length ? String(Math.trunc(tempi.length % 2 ? tempi[m] : (tempi[m - 1] + tempi[m]) / 2)) : '';
      o.dopo_feedback = Number(r0.partita) > 1 ? 1 : 0;
      return o;
    });
  }

  function unisci(suDisco, nuove) {
    var colonne = COLONNE.slice();
    suDisco.colonne.forEach(function (c) { if (colonne.indexOf(c) < 0) colonne.push(c); });
    var perChiave = {}, ordine = [];
    function metti(r) {
      var k = r.sessione_id + '|' + r.indice;
      if (!(k in perChiave)) ordine.push(k);
      perChiave[k] = r;
    }
    suDisco.righe.forEach(metti);
    nuove.forEach(metti);
    // le righe di una partita restano insieme, in ordine di schermata
    var posizione = {}, n = 0;
    ordine.forEach(function (k) { var sid = perChiave[k].sessione_id; if (!(sid in posizione)) posizione[sid] = n++; });
    var righe = ordine.map(function (k) { return perChiave[k]; }).sort(function (a, b) {
      return (posizione[a.sessione_id] - posizione[b.sessione_id]) || (Number(a.indice) - Number(b.indice));
    });
    return { colonne: colonne, righe: righe };
  }

  async function leggiDaDisco(modo) {
    if (modo === 'server') {
      var r = await fetch('risultati/' + NOME_FILE, { cache: 'no-store' });
      if (r.status === 404) return '';
      // qualunque altro errore FERMA la scrittura: meglio non salvare adesso che
      // sovrascrivere un file che non si e' riusciti a leggere
      if (!r.ok) throw new Error('lettura del file su disco non riuscita (' + r.status + ')');
      return r.text();
    }
    var fh = await cartella.getFileHandle(NOME_FILE, { create: true });
    return (await fh.getFile()).text();
  }

  async function scriviSuDisco(modo, testo, nome) {
    nome = nome || NOME_FILE;
    if (modo === 'server') return salvaSulServer(nome, testo);
    var fh = await cartella.getFileHandle(nome, { create: true });
    var w = await fh.createWritable();
    await w.write(testo);
    await w.close();
    ultimaScritturaCartella = Date.now();
    return true;
  }

  async function sincronizza(modo) {
    var tutto = await leggiTutto();
    var suDisco = leggiCsv(await leggiDaDisco(modo));
    if (suDisco.righe.length && suDisco.colonne.indexOf('sessione_id') < 0)
      throw new Error('il file su disco non sembra un file del quiz: non lo tocco');
    var unito = unisci(suDisco, righePiatte(tutto.sessioni, tutto.righe));
    if (!unito.righe.length) return true;
    if (!(await scriviSuDisco(modo, csvDaRighe(unito.colonne, unito.righe)))) return false;
    // il riepilogo si scrive DOPO il file completo, e solo se quello e' andato a buon fine
    return scriviSuDisco(modo, csvDaRighe(COLONNE_RIEPILOGO, righeRiepilogo(unito.righe)), NOME_RIEPILOGO);
  }

  /* Chiede al mini server di chiudere il quiz (Edge in modalita' chiosco non
     lascia chiudere la finestra a una pagina). Prima si svuota la coda delle
     scritture: si chiude solo con tutto gia' su disco. */
  async function chiediUscita() {
    if (!server) return false;
    await codaDisco;
    try {
      var r = await fetch('api/esci', { method: 'POST' });
      return r.ok && (await r.json()).ok === true;
    } catch (e) { return false; }
  }

  /* Le scritture su disco passano IN FILA: ognuna legge il file e lo riscrive,
     e due in parallelo potrebbero perdere le righe l'una dell'altra. */
  var codaDisco = Promise.resolve();
  function salvaSuDisco() {
    var esito = codaDisco.then(async function () {
      try {
        if (aulaConfigurata()) {
          // MODALITA' AULA: si va solo dal server dei risultati. Niente cartella
          // e niente file scaricato: su un dispositivo personale sarebbero due
          // strade che non portano i dati a chi li raccoglie.
          if (!remoto) await cercaRemoto();
          if (!remoto) {
            invio.stato = 'in_coda';
            invio.errore = 'server non raggiungibile';
            inSospeso = true;
            notifica();
            programmaRitentativo();
            return 'errore';
          }
          // in aula NON si manda il riepilogo: si ricava dai file delle partite
          // con analizza_risultati.py, e ogni file in piu' sarebbe un commit in piu'
          return (await inviaPartiteRemote()) ? 'remoto' : 'errore';
        }
        if (server) return (await sincronizza('server')) ? 'server' : 'errore';
        if ((await statoCartella()) === 'collegata') return (await sincronizza('cartella')) ? 'cartella' : 'errore';
        return 'nessuno';
      } catch (e) {
        ultimoErroreCartella = (e && e.message) || 'errore';
        // una lettura andata male non e' un errore definitivo: si riprova
        if (aulaConfigurata()) {
          invio.stato = 'in_coda';
          invio.errore = ultimoErroreCartella;
          inSospeso = true;
          notifica();
          programmaRitentativo();
        }
        return 'errore';
      }
    });
    codaDisco = esito.catch(function () {});
    return esito;
  }

  /* ── stato per il pannello operatore ─────────────────────────────────── */
  async function riepilogo() {
    var tutto = await leggiTutto();
    return {
      archivio: tipo,
      sessioni: tutto.sessioni.length,
      complete: tutto.sessioni.filter(function (s) { return s.fine === 'completata'; }).length,
      non_esportate: tutto.sessioni.filter(function (s) { return !s.esportata; }).length,
      risposte: tutto.righe.filter(function (r) { return r.risposta; }).length,
      server: server,
      cartella: await statoCartella(),
      ultima_scrittura_cartella: ultimaScritturaCartella,
      errore_cartella: ultimoErroreCartella,
      aula: aulaConfigurata(),
      remoto: remoto,
      invio: statoInvio(),
    };
  }

  return {
    apri: apri, salvaSessione: salvaSessione, salvaRiga: salvaRiga, leggiTutto: leggiTutto,
    leggiImpostazione: leggiImpostazione, scriviImpostazione: scriviImpostazione,
    csv: csv, esporta: esporta, nomeSicuro: nomeSicuro,
    condivisioneSupportata: condivisioneSupportata,
    cartellaSupportata: cartellaSupportata, caricaCartella: caricaCartella,
    statoCartella: statoCartella, collegaCartella: collegaCartella,
    riconfermaCartella: riconfermaCartella,
    riepilogo: riepilogo, COLONNE: COLONNE,
    cercaServer: cercaServer, serverAttivo: serverAttivo, salvaSuDisco: salvaSuDisco,
    cercaRemoto: cercaRemoto, remotoAttivo: remotoAttivo, aulaConfigurata: aulaConfigurata,
    statoInvio: statoInvio, nomeRemoto: nomeRemoto, nomeDispositivo: nomeDispositivo,
    partitaInviata: partitaInviata, invioInSospeso: invioInSospeso, segnaPartitaInCorso: segnaPartitaInCorso,
    partitaFinita: partitaFinita,
    leggiCsv: leggiCsv, unisci: unisci, NOME_FILE: NOME_FILE, NOME_RIEPILOGO: NOME_RIEPILOGO,
    righeRiepilogo: righeRiepilogo, chiediUscita: chiediUscita,
    tipo: function () { return tipo; },
  };
})();
