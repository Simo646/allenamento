# Allenamento su misura

Programma la settimana, registra le sessioni (forza serie per serie, timer HIIT, uscite col GPS o dai file del dispositivo) e segui i progressi sulle tue zone di battito.

## Come si installa sul telefono

1. Apri l'indirizzo dell'app nel browser del telefono: Chrome su Android, Safari su iPhone.
2. **Android:** menu con i tre puntini, poi "Installa app" o "Aggiungi a schermata Home".
3. **iPhone:** pulsante Condividi, poi "Aggiungi alla schermata Home".
4. Apri l'app dall'icona e segui il primo avvio: anno di nascita, zone di battito, attività, settimana di partenza.

Dopo il primo avvio l'app funziona anche senza rete.

**App Android:** per registrare anche a schermo spento c'è l'app da installare, nella pagina [Allenamento per Android](https://simo646.github.io/allenamento/android/).


## Dove stanno i dati

Allenamenti, schede, tracce GPS e misure restano solo sul tuo telefono, nella memoria dell'app: l'app non ha un server
e non li invia da nessuna parte. Anche i file FIT, GPX e TCX che importi si leggono sul telefono, senza caricarli.

Come per ogni sito, chi lo ospita vede l'indirizzo IP di chi lo apre: GitHub per l'app e jsDelivr per il lettore dei
file FIT, scaricato alla prima apertura. L'app Android, all'avvio, chiede a GitHub se c'è una versione nuova.

Per non perderli, ogni tanto apri **Impostazioni › I tuoi dati › Esporta un backup** e salva il file in un posto
privato (Drive, iCloud, Dropbox): contiene anche le tracce GPS, che mostrano da dove parti.
Su un telefono nuovo, al primo avvio scegli **Importa un backup**.

## Cosa fa

- Settimana tipo da lunedì a domenica, con le schede che vuoi: forza (esercizi, serie, chili, ripetizioni), HIIT, corsa, camminata, trekking, bici da strada, gravel o MTB.
- Schede da leggere al volo come un foglio da palestra, da duplicare e da avviare con un tocco; le serie uguali si scrivono in una riga.
- Forza serie per serie, con i carichi dell'ultima volta, il recupero che parte da solo (con un bip a 3-2-1 quando finisce) e le note dell'esercizio sotto gli occhi; gli esercizi si contano in ripetizioni o in secondi.
- Registra sessione: scegli l'attività e la scheda (l'app propone quella di oggi) e parti quando sei pronto. Corsa, camminata, trekking e bici col GPS del telefono; timer HIIT con l'esercizio in corso, il successivo e i bip a 3-2-1 prima di ogni inizio e fine; forza serie per serie. La fascia cardio Bluetooth è facoltativa. Dal browser funziona a schermo acceso (su iPhone solo il GPS, senza fascia); l'app Android registra il cardio anche a schermo spento.
- Import dei file FIT, GPX e TCX di orologi, ciclocomputer e app (Garmin, Wahoo, Coros, Polar, Suunto, Strava…): traccia, battito, zone, quota, velocità, potenza e cadenza quando ci sono.
- Zone di battito calcolate dall'età, con la formula di Karvonen o scritte a mano, e un promemoria di cosa allena ognuna.
- Grafici: minuti e zone per settimana, distanze, passo o velocità, massimale stimato per esercizio.
- Moduli facoltativi: sonno con avviso di recupero, ossigeno nel sonno, peso.

## Note

Il lettore dei file FIT è il [Garmin FIT JavaScript SDK](https://www.npmjs.com/package/@garmin/fitsdk), caricato da jsDelivr alla prima apertura e soggetto alla licenza FIT di Garmin: l'app controlla che ogni file sia identico all'originale prima di usarlo. I caratteri sono Barlow e Barlow Semi Condensed (SIL Open Font License, testo in `fonti/`), inclusi nel sito.
