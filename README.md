# UFO — VHDL Learning Workbench

UFO è una WebApp locale e monoutente per esercitarsi con **VHDL (VHSIC Hardware Description Language)** senza usare direttamente il terminale. Permette di organizzare sorgenti e testbench, eseguire simulazioni con GHDL, aprire le forme d’onda con GTKWave e produrre un diagramma **RTL (Register-Transfer Level)** con Yosys e netlistsvg.

La prima versione è pensata per WSL-FeLED e ascolta esclusivamente su `127.0.0.1`. Non è un servizio multiutente e non configura repository remoti.

## Requisiti

Sono necessari gli strumenti già predisposti nella WSL:

- Node.js 22 e npm;
- GHDL 5.0.1;
- Yosys 0.52;
- GTKWave 3.3.126 con WSLg per la finestra grafica;
- netlistsvg 1.0.2 e Monaco Editor 0.56.0, installati localmente nel progetto.

Non installare OSS CAD Suite per questo progetto. Non sono richiesti framework frontend o backend, database, Docker o installazioni globali npm.

## Installazione locale

Dalla radice `UFO-WA`, ricostruire le dipendenze fissate dal lockfile:

```bash
npm ci --ignore-scripts
```

Il comando installa soltanto dipendenze locali in `node_modules/`; non usa `sudo` e non modifica la configurazione globale npm. Il lockfile è la fonte della versione esatta. Le dipendenze legacy di netlistsvg possono produrre advisory npm: non eseguire `npm audit fix` senza una successiva regressione completa del flusso RTL.

## Avvio e aggiornamento da GitHub

Per gli studenti è disponibile `ufo.sh`, che clona automaticamente l’ultima release con tag `vX.Y.Z` nella cartella `~/UFO-WA`, installa le sole dipendenze npm locali fissate dal lockfile e avvia UFO. Alle esecuzioni successive controlla i tag GitHub e aggiorna il clone solo se esiste una release più recente.

Il primo avvio può essere effettuato scaricando lo script senza configurare chiavi SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/gmatrell/UFO-WA-studenti/main/ufo.sh -o "$HOME/ufo.sh"
bash "$HOME/ufo.sh"
```

Lo script richiede Git, Node.js 22 o successivo e npm già presenti; non installa programmi di sistema. Controlla inoltre la presenza di GHDL, Yosys e GTKWave e mostra un avviso se uno di questi strumenti manca. Dopo avere avviato il servizio apre automaticamente `http://127.0.0.1:8080` nel browser disponibile; se non rileva un launcher grafico, mostra l’indirizzo da aprire manualmente. Un clone con modifiche locali non viene aggiornato automaticamente, per evitare di sovrascrivere il lavoro dello studente.

## Avvio

Avvio normale, con la cartella `Workspace` nella home WSL:

```bash
npm start
```

Aprire quindi <http://127.0.0.1:8080> nel browser.

Per il collaudo sui progetti inclusi nel repository:

```bash
npm start -- --projects-root Test
```

La radice può essere scelta con questa precedenza:

1. opzione CLI (Command-Line Interface) `--projects-root PERCORSO`;
2. variabile `UFO_PROJECTS_ROOT`;
3. valore predefinito `~/Workspace`.

Esempi:

```bash
UFO_PROJECTS_ROOT=/home/feled/Workspace npm start
npm start -- --projects-root /home/feled/Workspace --port 8080
```

La porta è opzionale e, come la radice, non può cambiare l’indirizzo di ascolto: il server usa sempre `127.0.0.1`.

## Organizzazione dei progetti

Ogni cartella diretta della radice attiva è un progetto. I progetti nuovi seguono questa struttura:

```text
Workspace/<progetto>/
  src/                         sorgenti e testbench VHDL
  results/
    simulation/<id-run>/       VCD (Value Change Dump), log e manifesto
    synthesis/<id-run>/        SVG (Scalable Vector Graphics), JSON e log
  .ufo/
    build/<id-job>/            librerie e temporanei GHDL/Yosys
    project.json               metadati locali
```

Per compatibilità, UFO riconosce anche progetti preesistenti con sorgenti direttamente nella radice, come `Test/AND2` e `Test/RCA`; nei progetti nuovi e nei progetti strutturati usa `src/` senza chiedere all'utente di gestire le cartelle. I risultati e i temporanei non vengono mai scritti nei sorgenti. Eliminazione di progetti e file significa spostamento in un cestino UFO recuperabile, non cancellazione immediata.

## Uso didattico

1. Selezionare un progetto nell’albero laterale.
2. Selezionare un progetto: UFO lo espande, apre il primo sorgente disponibile e mostra i file nella gerarchia delle entity/istanze. Aprire poi una o più sorgenti `.vhd`/`.vhdl` nelle schede Monaco Editor. Monaco è l’editor browser derivato da Visual Studio Code; qui è configurato con un tokenizer essenziale per VHDL e il tema scuro UFO.
3. Premere `＋ VHDL` e inserire il nome della ENTITY di design: UFO genera dal contenuto di `Template/Template.vhd` e `Template/Template_tb.vhd` i file `<nome>.vhd` e `<nome>_tb.vhd`, sostituendo `$NOME` e `$NOME_tb`. Per aggiungere uno o più file esistenti usare `⇧ Importa`. `Ctrl+S` salva la scheda attiva.
4. Controllare i selettori `Design2RTL` e `Testbench`. UFO analizza le entity: considera testbench quelle il cui nome termina con `_tb` oppure prive di porte `port(...)`; le altre sono proposte come design. Analizza inoltre le istanze dirette per ricostruire la gerarchia, mentre la scelta resta esplicita quando il risultato è ambiguo.
5. Selezionare il testbench e premere `SIMULA`. La console mostra analisi, ordine di elaborazione, elaborazione, esecuzione, comandi, output standard, errori e codice di uscita. La prima versione usa un tempo massimo predefinito di `1us`.
6. Al termine della simulazione UFO avvia automaticamente GTKWave come finestra WSLg separata: l’applicazione desktop non è incorporata nel documento browser.
7. Selezionare il file nel menu `Design2RTL` e premere `SINTESI RTL` per avviare separatamente GHDL synth → Verilog → Yosys → netlistsvg. Il diagramma SVG viene aperto in una nuova finestra del browser.
8. Usare `■ Interrompi` per terminare il job corrente. È consentito un job per progetto alla volta.

Gli errori GHDL che contengono file, riga e colonna vengono trasformati in marker Monaco quando il file è aperto. La console conserva sempre anche il testo originale del tool.

## Sicurezza e limiti

Il backend usa percorsi assoluti validati, rifiuta traversal (`..`), percorsi assoluti e link simbolici, limita i file VHDL a 1 MiB e non costruisce comandi tramite shell. I processi hanno timeout, output limitato e vengono terminati come gruppo. L’API (Application Programming Interface) richiede un token di sessione e controlla l’origine HTTP (HyperText Transfer Protocol).

Queste misure non sono una sandbox di sistema: un VHDL non fidato può ancora consumare risorse o usare le primitive di file I/O con i permessi dell’utente. La versione 1 è destinata a sorgenti dello studente o provenienti da fonti fidate. Non vengono accettati JSON, skin netlistsvg o script Yosys arbitrari dall’interfaccia.

## Test

```bash
npm test
```

La suite verifica configurazione della radice, confinamento dei percorsi e dei link simbolici, API CRUD (Create, Read, Update, Delete), riconoscimento della gerarchia RCA e un collaudo completo AND2 in una copia temporanea. Il collaudo non modifica i file di riferimento in `Test`.

Per controllare manualmente il progetto gerarchico:

```bash
npm start -- --projects-root Test
```

Selezionando RCA, UFO propone `RCA` come top-level e `RCA_tb` come testbench; `RCA` istanzia `FA`, che a sua volta istanzia `HA`.

### Riconoscimento di Design e Testbench

La classificazione non dipende dall'estensione o dal nome del file, ma dall'entity VHDL dichiarata al suo interno. UFO rimuove prima i commenti e considera un'entity un testbench quando il suo nome termina con `_tb` oppure quando non contiene una dichiarazione di porte `port(...)`. Un file chiamato `mio_tb.vhd` può quindi essere trattato come design se contiene un'entity con porte, mentre un file con un nome diverso può essere trattato come testbench se contiene un'entity senza porte.

Le istanze dirette nella forma `entity work.NOME` servono a ricostruire la gerarchia e a proporre il top-level. Nella sidebar la convenzione `<nome-design>_tb` associa visivamente il testbench al design corrispondente; i testbench non associabili restano in un gruppo separato.

## Arresto e diagnostica

Arrestare il server con `Ctrl+C`. Se la porta è occupata, scegliere un’altra porta con `--port`; la radice dei progetti resta indipendente dalla porta. Versioni, comandi, hash dei sorgenti, log e risultati di ogni job vengono conservati nel relativo manifesto sotto `results/`.
