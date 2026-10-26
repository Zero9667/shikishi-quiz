/* ==========================================================================
   COMPOSIZIONE DELLA PARTITA
   Logica pura: nessun accesso a schermo, archivio o orologio. Riceve i dati, lo
   stato del dispositivo e del partecipante, e un seme. Si verifica in
   isolamento con test.html.

   UNA PARTITA = UN AUTORE
   3 opere autentiche di riferimento, poi N immagini di quell'autore in ordine
   casuale (meta' autentiche, il resto diviso fra copie a mano e AI) con i
   cartoncini di controllo dell'attenzione inseriti uno per segmento.

   AUTORI: CASUALI MA SENZA RIPETIZIONI
   Gli autori si estraggono da un "sacchetto" mescolato: ognuno esce una volta
   sola finche' il sacchetto non e' vuoto, poi si rimescola. Cosi' l'ordine e'
   casuale ma nessun autore esce due volte prima che siano usciti tutti.
   Chi gioca di nuovo riceve sempre un autore che non ha ancora visto, finche'
   ce n'e' uno disponibile.

   CHI GIOCA DI NUOVO NON RIVEDE LE STESSE IMMAGINI
   Le immagini gia' viste dal partecipante sono escluse. Se per una categoria
   non ne restano abbastanza (puo' succedere solo con partite lunghe o con lo
   stesso autore ripetuto), si completa con le meno viste sul dispositivo.

   ORDINE CASUALE
   Il pool elenca le immagini per categoria: la sequenza mostrata viene
   rimescolata con Fisher-Yates, e test.html verifica su migliaia di partite che
   ogni posizione abbia la stessa probabilita' di ospitare ogni categoria.

   I CONTROLLI CHIEDONO PULSANTI DIVERSI
   Chi preme sempre lo stesso pulsante sbaglia per forza tutti i controlli meno
   uno, e chi tira a caso li supera tutti solo una volta su 3^n.
   ========================================================================== */
'use strict';

var Sessione = (function () {

  var CATEGORIE = ['autentico', 'copia', 'ai'];
  var IMMAGINI_AMMESSE = [6, 8, 12, 16];
  var IMMAGINI_PREDEFINITE = 12;

  function permutazioni(v) {
    if (v.length <= 1) return [v.slice()];
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var resto = v.slice(0, i).concat(v.slice(i + 1));
      permutazioni(resto).forEach(function (p) { out.push([v[i]].concat(p)); });
    }
    return out;
  }
  var PERM_CONTROLLI = permutazioni(CATEGORIE);

  /* Generatore pseudocasuale con seme (mulberry32). Attenzione: il seme da solo
     NON basta a ricostruire la partita, perche' la composizione dipende anche
     dallo stato del dispositivo (sacchetto degli autori, contatori, immagini
     gia' viste). La sequenza reale e' comunque salvata riga per riga. */
  function generatore(seme) {
    var a = seme >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fisher-Yates: ogni permutazione ugualmente probabile. */
  function mescola(v, rng) {
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  /* I primi n fra i meno usati, a parita' di uso in ordine casuale. */
  function menoUsati(elementi, conteggi, n, rng) {
    return mescola(elementi.slice(), rng)
      .map(function (e, i) { return { e: e, c: conteggi[e] || 0, i: i }; })
      .sort(function (x, y) { return x.c - y.c || x.i - y.i; })
      .slice(0, n)
      .map(function (x) { return x.e; });
  }

  function normalizzaN(n) {
    return IMMAGINI_AMMESSE.indexOf(+n) >= 0 ? +n : IMMAGINI_PREDEFINITE;
  }

  /* Meta' autentiche; il resto diviso fra copie e AI, con l'eventuale immagine
     dispari che va a una delle due a turno, cosi' sul lungo periodo copie e AI
     restano in equilibrio. */
  function composizione(n, turno) {
    var aut = Math.round(n / 2), resto = n - aut;
    var copia = Math.floor(resto / 2), ai = copia;
    if (resto % 2) { if (turno % 2) ai++; else copia++; }
    return { autentico: aut, copia: copia, ai: ai };
  }

  /* Quanti cartoncini: due nelle partite corte, tre in quelle lunghe. Con meno
     di due la regola di esclusione "almeno due controlli sbagliati" non
     sarebbe applicabile. */
  function numeroControlli(n) { return n <= 8 ? 2 : 3; }

  /**
   * dati    window.DATI
   * stato   {
   *   sessioni: n, autori: {id: n}, immagini: {uid: n},   // contatori del dispositivo
   *   sacchetto: [id, ...],                               // autori non ancora estratti
   *   partecipante: { autori: [id, ...], immagini: {uid: 1} }
   * }
   * opzioni { immagini: 6|8|12|16 }
   * seme    intero
   */
  function componi(dati, stato, opzioni, seme) {
    var rng = generatore(seme);
    stato = stato || {};
    var part = stato.partecipante || {};
    var autoriVisti = part.autori || [];
    var immaginiViste = part.immagini || {};
    var n = normalizzaN((opzioni || {}).immagini);
    var comp = composizione(n, stato.sessioni || 0);

    // ── autore dal sacchetto, saltando quelli gia' giocati dal partecipante ──
    var tutti = dati.autori.map(function (a) { return a.id; });
    var sacchetto = (stato.sacchetto || []).filter(function (id) { return tutti.indexOf(id) >= 0; });
    if (!sacchetto.length) sacchetto = mescola(tutti.slice(), rng);
    var i = 0;
    while (i < sacchetto.length && autoriVisti.indexOf(sacchetto[i]) >= 0) i++;
    if (i === sacchetto.length) i = 0;            // ha gia' visto tutto il sacchetto
    var idScelto = sacchetto.splice(i, 1)[0];
    var autore = dati.autori.filter(function (a) { return a.id === idScelto; })[0];

    // ── immagini: prima quelle mai viste da questo partecipante ─────────────
    var uids = [];
    CATEGORIE.forEach(function (cat) {
      var pool = autore.stimoli.filter(function (u) { return dati.stimoli[u].categoria === cat; });
      var nuove = pool.filter(function (u) { return !immaginiViste[u]; });
      var scelte = menoUsati(nuove, stato.immagini || {}, comp[cat], rng);
      if (scelte.length < comp[cat]) {            // poche nuove: si completa con le meno viste
        var resto = pool.filter(function (u) { return scelte.indexOf(u) < 0; });
        scelte = scelte.concat(menoUsati(resto, stato.immagini || {}, comp[cat] - scelte.length, rng));
      }
      uids = uids.concat(scelte);
    });
    mescola(uids, rng);

    // ── cartoncini: uno per segmento, mai come primo giudizio ───────────────
    var nc = numeroControlli(n);
    var richiesti = PERM_CONTROLLI[(stato.sessioni || 0) % PERM_CONTROLLI.length].slice(0, nc);
    var dopo = [];
    for (var k = 0; k < nc; k++) {
      var lo = Math.floor(k * uids.length / nc), hi = Math.floor((k + 1) * uids.length / nc);
      dopo.push(lo + 1 + Math.floor(rng() * (hi - lo)));
    }

    // posizione_stimolo: posizione fra i soli stimoli (0..n-1), per gli effetti
    // di fatica e apprendimento. gia_vista: 1 solo nel ripiego, quando per una
    // categoria non restavano immagini nuove per questo partecipante.
    var prove = [], indice = 0, c = 0;
    for (var s = 0; s <= uids.length; s++) {
      while (c < nc && dopo[c] === s) {
        prove.push({ indice: indice, blocco: 0, posizione: indice, tipo: 'controllo', richiesto: richiesti[c] });
        indice++; c++;
      }
      if (s < uids.length) {
        prove.push({ indice: indice, blocco: 0, posizione: indice, tipo: 'stimolo',
                     image_uid: uids[s], categoria: dati.stimoli[uids[s]].categoria,
                     posizione_stimolo: s, gia_vista: immaginiViste[uids[s]] ? 1 : 0 });
        indice++;
      }
    }

    return {
      seme: seme >>> 0, controlli: richiesti.join(','), n_immagini: n,
      composizione: comp.autentico + '/' + comp.copia + '/' + comp.ai,
      sacchetto: sacchetto,
      // un solo blocco: la struttura resta per non cambiare il formato dei dati
      blocchi: [{ blocco: 0, autore: autore.id, nome: autore.nome, fascia: autore.fascia,
                  riferimenti: autore.riferimenti.slice(), prove: prove }],
    };
  }

  /* Aggiorna lo stato DOPO aver composto la partita: contatori del dispositivo,
     sacchetto degli autori, autori e immagini gia' visti dal partecipante.
     Separato da componi(), che deve restare pura. */
  function aggiornaStato(stato, sessione) {
    stato = stato || {};
    var part = stato.partecipante || {};
    var nuovo = {
      sessioni: (stato.sessioni || 0) + 1,
      autori: Object.assign({}, stato.autori || {}),
      immagini: Object.assign({}, stato.immagini || {}),
      sacchetto: sessione.sacchetto.slice(),
      partecipante: {
        autori: (part.autori || []).slice(),
        immagini: Object.assign({}, part.immagini || {}),
      },
    };
    sessione.blocchi.forEach(function (bl) {
      nuovo.autori[bl.autore] = (nuovo.autori[bl.autore] || 0) + 1;
      if (nuovo.partecipante.autori.indexOf(bl.autore) < 0) nuovo.partecipante.autori.push(bl.autore);
      bl.prove.forEach(function (p) {
        if (p.tipo !== 'stimolo') return;
        nuovo.immagini[p.image_uid] = (nuovo.immagini[p.image_uid] || 0) + 1;
        nuovo.partecipante.immagini[p.image_uid] = 1;
      });
    });
    return nuovo;
  }

  /* Da chiamare quando arriva un partecipante nuovo: azzera solo la sua parte. */
  function nuovoPartecipante(stato) {
    var nuovo = Object.assign({}, stato || {});
    nuovo.partecipante = { autori: [], immagini: {} };
    return nuovo;
  }

  return {
    componi: componi, aggiornaStato: aggiornaStato, nuovoPartecipante: nuovoPartecipante,
    composizione: composizione, numeroControlli: numeroControlli, normalizzaN: normalizzaN,
    CATEGORIE: CATEGORIE, IMMAGINI_AMMESSE: IMMAGINI_AMMESSE, IMMAGINI_PREDEFINITE: IMMAGINI_PREDEFINITE,
    PERM_CONTROLLI: PERM_CONTROLLI,
  };
})();
