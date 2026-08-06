DIVIETO ASSOLUTO DI USARE I COMANDI GIT.

# Contesto operativo

monorepo pnpm
frontend in apps/web: Next.js 16 / React 19
backend in apps/api: NestJS
UI basata su Tailwind CSS v4
palette custom documentate per area funzionale
componenti futuri orientati a Headless UI
icone Lucide React

# Note di architettura

Il backend in `apps/api` e' separato dal frontend in `apps/web` per esporre API interrogabili anche da altri frontend o client.

Di conseguenza, il backend non deve essere progettato come dipendenza esclusiva del frontend Next.js presente in questo monorepo.

Il backend è AGNOSTICO. NON SI INCLUDONO SCELTE GRAFICHE!

Il payload contiene parametri filtri come scelta lingua, order by e simili.

PER TE LA CARTELLA "DOCS" ESISTE SOLO SE NE PARLA L'UTENTE. 

# Regola generale HTTP GET/POST

La documentazione HTTP ufficiale (RFC 9110) definisce `GET` come metodo adatto al recupero dati e `POST` come metodo per fare processare al server il contenuto della richiesta.

`GET` con query string e' corretto quando i parametri non sono sensibili e rappresentano filtri di lettura, per esempio lingua, ordinamento, direzione ordinamento o altri filtri non sensibili.

La stessa RFC segnala che gli URI non sono un contenitore sicuro per dati sensibili: URL e query possono comparire in log, history, bookmark, display o header `Referer`.

`POST` e' preferibile quando i filtri contengono dati sensibili, dati personali, token, identificativi da non esporre nell'URL, o quando il payload e' complesso/lungo. In quel caso i dati stanno nel body e non nella URI, ma la richiesta perde le semantiche safe/cache-friendly tipiche di `GET`.

HTTPS, autenticazione e autorizzazione backend restano obbligatori e non sono sostituiti dal passaggio da `GET` a `POST`.

# Regola generale aree portale dedicate

Le aree portale dedicate sono aree riservate ad utenti autenticati provenienti da specifiche tabelle utenti.

Le aree portale dedicate devono usare un'esperienza tipo SPA, ma con route reali e URL significativi quando cambia una maschera o un servizio rilevante.

Non si costruiscono finte SPA dove cambia il contenuto principale ma l'URL resta sempre fermo sul punto di ingresso.

Il punto di ingresso di un'area portale dedicata apre l'esperienza principale dell'area. I servizi interni rilevanti devono essere raggiungibili con route dedicate, cosi' restano compatibili con refresh, cronologia browser, deep-link, condivisione URL e navigazione documentata.

Stati temporanei, pannelli aperti, input in corso, messaggi non persistenti o passaggi intermedi non rilevanti possono restare nello state React senza cambiare URL.

Oggi esiste il portale clienti; domani potranno esistere altre aree portale dedicate. Devono seguire la stessa regola generale.

# Regola portale clienti

Il portale clienti e' mobile first, con interfaccia desktop accurata.

La palette colori del portale clienti e' gia' definita nel CSS dell'app web e deve essere rispettata.

Deve esserci un finto assistente BOT/AI, ma integrato nella pagina delle attivita' di oggi oppure mostrato come splash iniziale a scomparsa.

Il tono visivo deve essere app-like, curato e premium, ma sempre operativo.
