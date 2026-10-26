/* ==========================================================================
   MODALITA' AULA: dove mandare i risultati
   --------------------------------------------------------------------------
   Con `endpoint` VUOTO l'app si comporta esattamente come sempre: chiosco su un
   PC, cartella dei risultati scelta a mano, oppure file scaricato. Non cambia
   niente, e questo file non fa niente.

   Con un indirizzo qui dentro l'app capisce di girare su un sito pubblico, con
   tanti studenti ognuno sul suo dispositivo: non c'e' nessun disco su cui
   scrivere e nessuno che scelga una cartella. Ogni partita viene mandata a
   quel server, che la mette al sicuro (vedi aula/worker.js e aula/LEGGIMI.md).

   L'INDIRIZZO NON E' UN SEGRETO
   Chi apre il codice della pagina lo legge, ed e' voluto: il segreto e' il
   token di GitHub con cui il server scrive i dati, e quello sta solo dentro il
   server, mai qui dentro.

   Uso: incollare l'indirizzo del server qui sotto, senza barra finale, poi
        rigenerare l'app con prepara_quiz.py e pubblicarla.

   `codice` e' FACOLTATIVO: serve solo se il server e' stato configurato con un
   codice d'aula (vedi aula/LEGGIMI.md). Lasciandolo vuoto non cambia nulla.
   ========================================================================== */
window.REMOTO = {
  endpoint: 'https://shikishi-risultati.rosario-licc.workers.dev',      // es. 'https://shikishi-risultati.esempio.workers.dev'
  codice: 'MANGA26',        // facoltativo: deve combaciare con CODICE_AULA del server
};
