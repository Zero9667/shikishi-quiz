/* ==========================================================================
   TESTI DELL'INTERFACCIA: italiano e inglese

   Un solo file, due lingue, le stesse chiavi. Tre modi di usarle:

     data-t="chiave"       scrive il testo nell'elemento (textContent)
     data-t-html="chiave"  scrive HTML (serve dove il testo contiene markup,
                           per esempio la guida con il numero di immagini)
     data-t-aria="chiave"  scrive aria-label e title
     T('chiave', {v: ...}) per le stringhe costruite in app.js

   DOVE SI TOCCA:
     - per cambiare una scritta: qui, e basta;
     - per aggiungere una lingua: un blocco qui e la sigla in LINGUE (app.js).

   NON si toccano i CODICI delle risposte (autentico / copia / ai): restano
   quelli nei dati, nel CSV e nei data-risposta dei pulsanti. Qui c'e' solo
   quello che si legge a schermo, quindi i dati raccolti non cambiano.

   Se una chiave manca in inglese si ripiega sull'italiano; se manca in
   entrambe resta visibile il nome della chiave, cosi' l'errore si vede
   subito invece di lasciare una scritta vuota.
   ========================================================================== */
window.TESTI = {

  it: {
    /* documento e schermata iniziale */
    titolo_doc: 'Vero o falso?',
    avvio_titolo: 'Vero <span class="o">o</span> falso?',
    avvio_testo: 'Riesci a distinguere un disegno autentico da una <b>copia fatta a mano</b> '
      + 'o da un\'immagine <b>creata con l\'intelligenza artificiale</b>? Prova, e sfida il nostro modello!',
    avvio_cta: 'TOCCA PER INIZIARE',
    avvio_1_partita: 'Su questa postazione è stata giocata 1 partita',
    avvio_n_partite: 'Su questa postazione sono state giocate {n} partite',
    avvio_allarme: 'ATTENZIONE: i risultati restano solo nell\'app ({n} partite)',

    /* pulsante della lingua e comandi della schermata iniziale */
    lingua_etichetta: 'EN',
    lingua_titolo: 'Passa all\'inglese',
    esci: 'ESCI',
    esci_aria: 'Chiudi il quiz',

    /* istruzioni e consenso */
    istr_titolo: 'Come funziona',
    es_autentico: 'È dell\'autore',
    es_copia: 'Copia a mano',
    es_ai: 'Fatta con AI',
    istr_guida: 'Ti mostriamo tre opere autentiche di un autore, poi <span id="istr-n">{n}</span> immagini. '
      + 'Per ognuna scegli se è davvero sua, se è una <b>copia disegnata a mano</b> da un\'altra persona '
      + 'o se è stata <b>creata con l\'intelligenza artificiale</b>. '
      + 'Ogni tanto comparirà un controllo che ti chiede di premere un pulsante preciso. '
      + 'Tocca un\'immagine per ingrandirla. Alla fine vedi com\'è andata, immagine per immagine.',
    q_rigiocato: 'Hai già giocato oggi?',
    q_minorenne: 'Hai meno di 18 anni?',
    si: 'Sì',
    no: 'No',
    consenso: 'I dati raccolti sono anonimi: non registriamo nome, contatti, foto né alcun dato '
      + 'che permetta di risalire a te. Servono a una ricerca sul riconoscimento automatico di opere '
      + 'contraffatte e saranno pubblicati solo in forma aggregata. La partecipazione è volontaria e puoi '
      + 'smettere in qualsiasi momento. Se hai meno di 18 anni, chiedi a chi ti accompagna di toccare '
      + '«Inizia» insieme a te.',
    istr_cta: 'INIZIA',

    /* riferimenti */
    rif_titolo: 'Opere autentiche di {autore}',
    rif_guida: 'Queste tre opere sono autentiche. Guardale bene: ti serviranno per riconoscere il suo tratto.',
    rif_zoom: 'Tocca un\'opera per vederla più grande',
    rif_cta: 'HO CAPITO, INIZIAMO',

    /* prova e cartoncino di controllo */
    p_opere: 'Opere autentiche',
    p_zoom: 'Tocca l\'immagine per ingrandirla',
    cart_titolo: 'CONTROLLO DI ATTENZIONE',
    cart_testo: 'Per questa immagine premi',
    cart_valore: '«{v}»',
    r_autentico: 'È di {autore}',
    r_copia: 'Copia a mano',
    r_ai: 'Fatta con AI',

    /* domande finali */
    dom_titolo: 'Ultime domande',
    q_caso: 'Hai risposto a caso almeno in parte?',
    nota_caso: 'Rispondi sinceramente: non cambia il tuo punteggio, ci serve a capire quali dati usare.',
    q_autore: 'Conoscevi {autore}?',
    q_autore_generico: 'Conoscevi questo autore?',
    o_no: 'No',
    o_di_nome: 'Di nome',
    o_opere: 'Sì, le sue opere',
    q_eta: 'Quanti anni hai?',
    eta_0: 'meno di 14',
    eta_1: '14-17',
    eta_2: '18-25',
    eta_3: '26-40',
    eta_4: '41-60',
    eta_5: 'oltre 60',
    q_manga: 'Quanto spesso leggi manga?',
    manga_0: 'mai',
    manga_1: 'ogni tanto',
    manga_2: 'spesso',
    manga_3: 'ogni giorno',
    q_disegno: 'Disegni?',
    disegno_0: 'no',
    disegno_1: 'per hobby',
    disegno_2: 'per studio o lavoro',
    q_visto: 'Avevi visto giocare qualcuno prima di te?',
    nota_profilo: 'Le domande sul profilo sono facoltative, e si fanno una volta sola.',
    dom_manca: 'Rispondi anche alla domanda evidenziata in rosso',
    dom_cta: 'VEDI IL RISULTATO',

    /* risultato */
    res_tu: 'Tu ·',
    res_modello: 'Il modello ·',
    res_titolo: '{autore}: com\'è andata',
    res_titolo_generico: 'Come è andata',
    res_tipo: 'Tipo indovinato esattamente: tu {x}/{n} · il modello {y}/{n}',
    invio_corso: 'Invio dei risultati… non chiudere la pagina',
    invio_ok: '✓ Risultati inviati',
    invio_coda: 'Invio in sospeso: lascia la pagina aperta, riprova da solo',
    leg_esatto: 'giusta',
    leg_quasi: 'hai capito che non era sua, ma era l\'altro tipo di falso',
    leg_sbagliato: 'sbagliata',
    cat_autentico: 'Autentica',
    cat_copia: 'Copia a mano',
    cat_ai: 'Fatta con AI',
    breve_autentico: 'È sua',
    breve_copia: 'Copia',
    breve_ai: 'AI',
    era: 'Era:',
    chi_tu: 'Tu',
    chi_modello: 'Modello',
    res_ancora: 'GIOCA ANCORA',
    res_fine: 'HO FINITO',
    res_nota: 'Il punteggio grande conta le immagini in cui hai distinto un\'opera autentica '
      + 'da una non autentica; la riga sotto il titolo dice quante volte hai indovinato anche il tipo di falso. '
      + 'Tocca un\'immagine per ingrandirla. Con «Gioca ancora» ti diamo un altro autore e immagini mai viste.',

    /* varie */
    autore_generico: 'questo autore',
    ruota: 'Gira il dispositivo in orizzontale',
    ruota_verticale: 'Gira il telefono in verticale',
    zoom_nota: 'Tocca lo sfondo o la ✕ per chiudere',
    chiudi_aria: 'Chiudi',
  },

  en: {
    /* documento e schermata iniziale */
    titolo_doc: 'Real or fake?',
    avvio_titolo: 'Real <span class="o">or</span> fake?',
    avvio_testo: 'Can you tell an authentic drawing from a <b>hand-made copy</b> '
      + 'or an <b>AI-generated image</b>? Try it, and take on our model!',
    avvio_cta: 'TAP TO START',
    avvio_1_partita: '1 game has been played on this station',
    avvio_n_partite: '{n} games have been played on this station',
    avvio_allarme: 'WARNING: results are only inside the app ({n} games)',

    /* pulsante della lingua e comandi della schermata iniziale */
    lingua_etichetta: 'IT',
    lingua_titolo: 'Switch to Italian',
    esci: 'EXIT',
    esci_aria: 'Close the quiz',

    /* istruzioni e consenso */
    istr_titolo: 'How it works',
    es_autentico: 'By the artist',
    es_copia: 'Hand-made copy',
    es_ai: 'Made with AI',
    istr_guida: 'We show you three authentic works by one artist, then <span id="istr-n">{n}</span> images. '
      + 'For each one choose whether it really is theirs, a <b>copy drawn by hand</b> by someone else, '
      + 'or an image <b>made with artificial intelligence</b>. '
      + 'Now and then a check will ask you to press one specific button. '
      + 'Tap an image to zoom in. At the end you see how you did, image by image.',
    q_rigiocato: 'Have you already played today?',
    q_minorenne: 'Are you under 18?',
    si: 'Yes',
    no: 'No',
    consenso: 'The data collected are anonymous: we record no name, contact details, photo or anything '
      + 'that could identify you. They support research on automatic recognition of counterfeit works and '
      + 'will be published only in aggregate form. Participation is voluntary and you may stop at any '
      + 'time. If you are under 18, please ask the adult with you to tap “Start” together with you.',
    istr_cta: 'START',

    /* riferimenti */
    rif_titolo: 'Authentic works by {autore}',
    rif_guida: 'These three works are authentic. Look closely: you will need them to recognise their hand.',
    rif_zoom: 'Tap a work to see it larger',
    rif_cta: 'GOT IT, LET\'S START',

    /* prova e cartoncino di controllo */
    p_opere: 'Authentic works',
    p_zoom: 'Tap the image to zoom in',
    cart_titolo: 'ATTENTION CHECK',
    cart_testo: 'For this image press',
    cart_valore: '“{v}”',
    r_autentico: 'It\'s by {autore}',
    r_copia: 'Hand-made copy',
    r_ai: 'Made with AI',

    /* domande finali */
    dom_titolo: 'Last questions',
    q_caso: 'Did you answer at random, at least partly?',
    nota_caso: 'Please answer honestly: it does not change your score, it tells us which data to use.',
    q_autore: 'Did you know {autore}?',
    q_autore_generico: 'Did you know this artist?',
    o_no: 'No',
    o_di_nome: 'By name',
    o_opere: 'Yes, their works',
    q_eta: 'How old are you?',
    eta_0: 'under 14',
    eta_1: '14-17',
    eta_2: '18-25',
    eta_3: '26-40',
    eta_4: '41-60',
    eta_5: 'over 60',
    q_manga: 'How often do you read manga?',
    manga_0: 'never',
    manga_1: 'now and then',
    manga_2: 'often',
    manga_3: 'every day',
    q_disegno: 'Do you draw?',
    disegno_0: 'no',
    disegno_1: 'as a hobby',
    disegno_2: 'for study or work',
    q_visto: 'Had you watched someone play before you?',
    nota_profilo: 'The profile questions are optional, and are asked only once.',
    dom_manca: 'Please also answer the question highlighted in red',
    dom_cta: 'SEE THE RESULT',

    /* risultato */
    res_tu: 'You ·',
    res_modello: 'The model ·',
    res_titolo: '{autore}: how it went',
    res_titolo_generico: 'How it went',
    res_tipo: 'Exact type guessed: you {x}/{n} · the model {y}/{n}',
    invio_corso: 'Sending results… please keep this page open',
    invio_ok: '✓ Results sent',
    invio_coda: 'Sending pending: keep this page open, it will retry',
    leg_esatto: 'correct',
    leg_quasi: 'you got that it wasn\'t theirs, but it was the other kind of fake',
    leg_sbagliato: 'wrong',
    cat_autentico: 'Authentic',
    cat_copia: 'Hand-made copy',
    cat_ai: 'Made with AI',
    breve_autentico: 'Theirs',
    breve_copia: 'Copy',
    breve_ai: 'AI',
    era: 'It was:',
    chi_tu: 'You',
    chi_modello: 'Model',
    res_ancora: 'PLAY AGAIN',
    res_fine: 'I\'M DONE',
    res_nota: 'The big score counts the images where you told an authentic work from a non-authentic one; '
      + 'the line under the title says how often you also guessed the kind of fake. '
      + 'Tap an image to zoom in. With “Play again” we give you another artist and images you have never seen.',

    /* varie */
    autore_generico: 'this artist',
    ruota: 'Turn the device sideways',
    ruota_verticale: 'Turn your phone upright',
    zoom_nota: 'Tap the background or ✕ to close',
    chiudi_aria: 'Close',
  },

};
