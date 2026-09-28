# Report di configurazione UFO-WA

- Creata la distribuzione WSL2 denominata `WSL-FeLED`.
- Installato Ubuntu 26.04 LTS.
- Creato e configurato l'utente `feled`.
- Eseguito l'aggiornamento iniziale dei pacchetti di sistema.
- Installato Codex CLI 0.146.0.
- Effettuato l'accesso a Codex tramite account ChatGPT.
- Creata la cartella di lavoro `~/UFO-WA`.

## Inventario iniziale dei software

Verifica eseguita il 4 agosto 2026 sulla cache APT configurata per Ubuntu 26.04 LTS (`resolute`), usando esclusivamente `apt-cache policy` e `apt-cache search`. Non è stato installato né aggiornato alcun pacchetto.

| Pacchetto | Versione candidata | Stato |
| --- | --- | --- |
| `ghdl` | `5.0.1+dfsg-1ubuntu1` | non installato |
| `gtkwave` | `3.3.126-1` | non installato |
| `yosys` | `0.52-2` | non installato |
| `nodejs` | `22.22.1+dfsg+~cs22.19.15-1ubuntu1` | non installato |
| `npm` | `9.2.0~ds3-1` | non installato |
| `git` | `1:2.53.0-1ubuntu1` | già installato; coincide con la versione candidata |

I pacchetti `ghdl`, `gtkwave`, `yosys`, `nodejs` e `npm` provengono dal componente `resolute/universe`; `git` proviene da `resolute/main`.

La ricerca per nome relativa a GHDL ha restituito: `ghdl`, `ghdl-common`, `ghdl-gcc`, `ghdl-llvm`, `ghdl-mcode`, `ghdl-tools`, `libghdl-5-0-1` e `libghdl-dev`.

La ricerca per nome relativa a Yosys ha restituito: `yosys`, `yosys-abc`, `yosys-dev` e `yosys-doc`.

Non è stato trovato alcun pacchetto per il plugin GHDL di Yosys: la ricerca di nomi contenenti sia `ghdl` sia `yosys` non ha prodotto risultati, e non risultano disponibili versioni candidate per le denominazioni plausibili `ghdl-yosys-plugin`, `yosys-plugin-ghdl` e `yosys-ghdl`.

## Installazione di GHDL e GTKWave

Installazione eseguita il 4 agosto 2026 con il comando:

```bash
sudo apt-get install ghdl gtkwave
```

Il registro APT riporta il comando effettivo `apt-get install ghdl gtkwave`, concluso regolarmente senza aggiornamenti o rimozioni di altri pacchetti.

Pacchetti richiesti installati:

| Pacchetto | Versione effettiva (`dpkg-query`) |
| --- | --- |
| `ghdl` | `5.0.1+dfsg-1ubuntu1` |
| `gtkwave` | `3.3.126-1` |

Dipendenze installate automaticamente:

| Pacchetto | Versione effettiva (`dpkg-query`) |
| --- | --- |
| `ghdl-common` | `5.0.1+dfsg-1ubuntu1` |
| `ghdl-mcode` | `5.0.1+dfsg-1ubuntu1` |
| `libjudydebian1` | `1.0.5-7` |
| `libtcl8.6` | `8.6.17+dfsg-1build1` |
| `libtk8.6` | `8.6.17-1build1` |
| `libxft2` | `2.3.6-1build2` |
| `libxss1` | `1:1.2.3-1build4` |

Verifiche eseguite:

- `ghdl --version`: `GHDL 5.0.1 (Ubuntu 5.0.1+dfsg-1ubuntu1) [Dunoon edition]`, backend mcode.
- `gtkwave --version`: l'eseguibile è presente, ma nella sessione corrente non stampa il banner perché GTK non può inizializzarsi senza un display grafico (`Could not initialize GTK! Is DISPLAY env var/xhost set?`). Anche `gtkwave -V` presenta lo stesso comportamento.
- `dpkg-query`: tutti i nove pacchetti elencati risultano correttamente installati con stato `ii`.
- `yosys`, `nodejs` e `npm` risultano tuttora non installati.

L'installazione APT non ha riportato errori. È comparso l'avviso non bloccante `ldconfig: /usr/lib/wsl/lib/libcuda.so.1 is not a symbolic link`. La mancata inizializzazione grafica durante la verifica di GTKWave riguarda l'assenza di `DISPLAY` nella sessione di controllo e non lo stato del pacchetto, la cui versione installata è confermata da `dpkg-query`.

## Test funzionale minimo di GHDL

Test eseguito il 4 agosto 2026 nella cartella `~/UFO-WA/Test`, senza avviare GTKWave e senza installare software.

File creati e conservati:

| File | Descrizione |
| --- | --- |
| `Test/AND2.vhd` | Design combinatorio VHDL a due ingressi, con `y <= a and b` |
| `Test/AND2_tb.vhd` | Testbench delle combinazioni `00`, `01`, `10` e `11`, con asserzioni |
| `Test/AND2_tb.vcd` | Traccia VCD prodotta dalla simulazione, 525 byte |
| `Test/work-obj08.cf` | Libreria di lavoro generata dall'analisi GHDL |

Comandi GHDL eseguiti da `~/UFO-WA/Test`:

```bash
ghdl -a --std=08 AND2.vhd AND2_tb.vhd
ghdl -e --std=08 AND2_tb
ghdl -r --std=08 AND2_tb --vcd=AND2_tb.vcd --stop-time=40ns
```

Comandi e metodo di verifica del VCD:

```bash
test -s AND2_tb.vcd
stat --printf='file=%n\nsize=%s bytes\n' AND2_tb.vcd
sed -n '1,220p' AND2_tb.vcd
awk '<controllo delle dichiarazioni e degli stati temporali>' AND2_tb.vcd
```

Lo script AWK eseguito in linea ha individuato gli identificatori VCD dei segnali di livello superiore `a`, `b` e `y`, ne ha mantenuto lo stato tra un timestamp e il successivo e ha confrontato cinque campioni con i valori attesi.

Risultati:

| Tempo | `a` | `b` | `y` | Esito |
| ---: | :-: | :-: | :-: | --- |
| 0 ns | 0 | 0 | 0 | corretto |
| 10 ns | 0 | 1 | 0 | corretto |
| 20 ns | 1 | 0 | 0 | corretto |
| 30 ns | 1 | 1 | 1 | corretto |
| 40 ns | 1 | 1 | 1 | corretto, stato mantenuto |

- Analisi, elaborazione e simulazione concluse con codice di uscita 0.
- Tutte le asserzioni del testbench sono state superate.
- Il VCD esiste, non è vuoto e contiene i segnali attesi `a`, `b` e `y` sia nel testbench sia nell'istanza `dut`.
- Le variazioni registrate nel VCD sono coerenti con la tabella di verità della funzione AND.
- Nessun errore o avviso. GHDL ha emesso soltanto la nota di completamento del testbench e il messaggio informativo di arresto al limite di 40 ns.

## Test grafico di GTKWave

Il 4 agosto 2026 è stato completato con successo il test grafico di GTKWave. L'applicazione si è avviata correttamente nell'ambiente grafico e la verifica ha avuto esito positivo.

## Valutazione del flusso di sintesi GHDL-Yosys

Analisi eseguita il 4 agosto 2026 senza installare, aggiornare o compilare software. OSS CAD Suite non è stata presa in considerazione, in conformità ai vincoli del progetto.

### Verifiche locali

| Elemento | Risultato |
| --- | --- |
| GHDL | installato in `/usr/bin/ghdl`, versione `5.0.1+dfsg-1ubuntu1` (Dunoon), backend `mcode`, compilato con GNAT 14.2.0 |
| Sintesi GHDL | il comando `ghdl synth` è disponibile; supporta generics del top, librerie vendor come black box e opzioni per assert/PSL |
| Uscita Verilog | verificata realmente con `ghdl synth --std=08 --out=verilog Test/AND2.vhd -e AND2`; il comando ha prodotto su standard output un modulo Verilog combinatorio coerente con `AND2.vhd` |
| Libreria per il plugin | `ghdl --libghdl-library-path` indica `/usr/lib/x86_64-linux-gnu/libghdl-5_0_1.so`, ma il file non è attualmente presente; `libghdl-dev` non è installato |
| Yosys | non installato; versione candidata APT `0.52-2` |
| Pacchetti di sviluppo | `yosys-dev` candidato `0.52-2`; `libghdl-dev` candidato `5.0.1+dfsg-1ubuntu1`, quindi allineati alle versioni applicative APT |
| Plugin nei repository | nessun risultato per `ghdl-yosys-plugin`, `yosys-plugin-ghdl`, `yosys-ghdl` o per nomi che contengano sia `ghdl` sia `yosys` |
| Tool di compilazione | `git` 2.53.0 è installato; `make`, `gcc`, `g++`, `gnatmake` e `build-essential` non sono installati |

Il pacchetto APT `yosys` dipende, tra l'altro, da `yosys-abc`, Python 3, `python3-click`, Tcl, libffi, readline e zlib; APT risolverebbe automaticamente tali dipendenze. `xdot` è soltanto raccomandato e serve alla visualizzazione grafica, non al flusso batch. Per compilare il plugin servirebbero inoltre almeno `yosys-dev`, `libghdl-dev` e una toolchain C/C++ quale `build-essential`; `yosys-dev` richiede a sua volta gli header Tcl, libffi e readline.

### Riscontri dalle fonti ufficiali

- La [documentazione di sintesi GHDL](https://ghdl.github.io/ghdl/using/Synthesis.html) definisce sia `synth` sia `yosys-plugin` come backend dello stesso kernel di sintesi, tuttora **sperimentale e in lavorazione**. Specifica che le netlist prodotte direttamente da GHDL non sono ottimizzate e documenta ufficialmente `--out=verilog`.
- La stessa documentazione descrive il plugin come uno strato sottile che trasferisce la rappresentazione interna di `synth` all'API C di Yosys e raccomanda di controllare prima il design con `ghdl synth`. Il plugin non amplia quindi il sottoinsieme VHDL sintetizzabile rispetto al kernel GHDL.
- Il [repository ufficiale ghdl-yosys-plugin](https://github.com/ghdl/ghdl-yosys-plugin) richiede Yosys, GHDL con sintesi e la compilazione di `ghdl.so` mediante `make`; il relativo Makefile usa `yosys-config`, gli header di GHDL e `libghdl`. Il progetto si dichiara sperimentale e [non pubblica release versionate](https://github.com/ghdl/ghdl-yosys-plugin/releases): per una distribuzione riproducibile sarebbe necessario fissare un commit verificato.
- La [documentazione ufficiale Yosys 0.52 di `read_verilog`](https://yosyshq.readthedocs.io/projects/yosys/en/v0.52/cmd/read_verilog.html) dichiara il supporto a un ampio sottoinsieme di Verilog-2005. La [documentazione dei flussi di sintesi](https://yosyshq.readthedocs.io/projects/yosys/en/v0.52/using_yosys/synthesis/synth.html) documenta sia la preparazione generica `prep` sia i flussi specifici per varie famiglie FPGA.

### Confronto delle soluzioni

| Soluzione | Compatibilità e dipendenze | Affidabilità e manutenzione | Limiti VHDL | Idoneità per la WSL degli studenti |
| --- | --- | --- | --- | --- |
| **1. GHDL genera Verilog, poi Yosys lo legge** | Compatibilità locale già confermata per GHDL 5.0.1 fino alla generazione Verilog; Yosys 0.52 supporta ufficialmente Verilog-2005. Richiede soltanto l'installazione APT di `yosys` e delle sue dipendenze automatiche. Il tratto completo dovrà essere provato dopo l'installazione. | **La più affidabile e semplice nel contesto attuale**: nessuna ABI di plugin, nessuna compilazione locale, versioni gestite da APT, due stadi ispezionabili e facilmente diagnosticabili. Manutenzione bassa. | Usa il sottoinsieme sintetizzabile del kernel GHDL, non tutto VHDL-2008. L'uscita è post-elaborazione: i generics sono risolti; nomi, gerarchia, attributi VHDL e informazioni per formal possono essere ridotti o trasformati. Il mixed-language richiede di convertire prima la parte VHDL e poi caricarla insieme al Verilog. | **Alta**: installazione breve, riproducibile e comprensibile; adatta come baseline didattica e come controllo intermedio del RTL generato. |
| **2. Yosys più ghdl-yosys-plugin compilato localmente** | In linea di principio compatibile: i candidati `libghdl-dev` 5.0.1 e `yosys-dev` 0.52 coincidono con GHDL/Yosys. Richiede `yosys`, `yosys-dev`, `libghdl-dev`, `build-essential`, sorgenti del plugin e `git` (già presente). La combinazione Ubuntu 26.04/GHDL 5.0.1/Yosys 0.52 non è dichiarata come matrice stabile upstream e va collaudata. | Integrazione più diretta in RTLIL e migliore ergonomia mixed-language, ma affidabilità operativa inferiore: progetto sperimentale, nessuna release, dipendenza dalle API/header di entrambe le versioni, compilazione e test da ripetere agli aggiornamenti. Occorre fissare un commit e conservare una procedura di rebuild. | Condivide esattamente il kernel e quindi i limiti di sintesi GHDL. Non rende sintetizzabili costrutti che `ghdl synth` rifiuta. Può evitare alcune perdite introdotte dal passaggio testuale in Verilog e consente il caricamento diretto VHDL/Verilog in Yosys. | **Media**: utilizzabile solo dopo una validazione robusta e con immagine WSL già preparata; sconsigliato come primo flusso perché aumenta componenti e manutenzione. |
| **3. Pacchetti precompilati Guix o container `hdlc/ghdl:yosys`** | Entrambe le possibilità sono indicate dal README ufficiale del plugin. Richiedono rispettivamente Guix oppure Docker/Podman e immagini esterne; introducono una seconda catena di distribuzione e versioni diverse da quelle APT già presenti. | Evitano la compilazione manuale del plugin, ma spostano il rischio su repository, immagini, rete, pin degli artefatti e integrazione WSL. Per la riproducibilità servirebbero versione o digest bloccati. | Identici limiti del kernel GHDL incluso nell'artefatto; occorre anche verificare che la versione contenuta corrisponda al materiale didattico. | **Bassa per la baseline**: più spazio, più concetti operativi e possibili difficoltà con WSL/virtualizzazione. Non necessarie per UFO-WA e non equivalgono a un vantaggio sufficiente rispetto ad APT. |
| **4. Frontend VHDL commerciale Verific per Yosys** | Yosys documenta la possibilità di essere compilato con Verific, ma richiede libreria e licenza commerciali e una build specifica; non è il pacchetto Ubuntu standard. | Tecnologia supportata dal lato Yosys, ma dipendenza proprietaria, costi e gestione licenze la rendono operativamente inadatta al progetto. | Copertura determinata dalla versione/licenza Verific, separata da GHDL; non realizza l'obiettivo di integrare l'installazione GHDL già presente. | **Non idonea** per una WSL didattica distribuibile. |

### Raccomandazione

Adottare come flusso RTL ufficiale iniziale di UFO-WA la soluzione **GHDL 5.0.1 `synth --out=verilog` → Yosys 0.52 `read_verilog`**. È l'unica opzione che combina una funzione ufficialmente documentata, già funzionante nell'installazione presente, con pacchetti Ubuntu versionati e senza compilazioni locali. Il file Verilog intermedio deve essere trattato come artefatto di build, non come sorgente da modificare.

Il plugin va mantenuto come possibile fase 2, non come prerequisito: valutarlo soltanto se i progetti reali dimostreranno la necessità di un flusso mixed-language diretto, di un trasferimento RTLIL senza netlist testuale o di funzionalità formal che il passaggio Verilog non conserva adeguatamente.

Comandi proposti, **non eseguiti**, per la futura installazione minima dopo autorizzazione:

```bash
apt-cache policy ghdl yosys yosys-abc
sudo apt-get install yosys
ghdl --version
yosys -V
```

Prova end-to-end proposta sul design già presente:

```bash
mkdir -p build
ghdl synth --std=08 --out=verilog -o build/AND2.v Test/AND2.vhd -e AND2
yosys -p 'read_verilog build/AND2.v; hierarchy -check -top AND2; prep -top AND2; check; stat; write_json build/AND2.json'
```

Schema da usare successivamente con un progetto reale:

```bash
ghdl synth --std=08 --out=verilog -o build/top.v src/package.vhd src/top.vhd -e top
yosys -p 'read_verilog build/top.v; hierarchy -check -top top; synth -top top; check; stat; write_json build/top.json'
```

Prima di distribuire la WSL agli studenti sarà necessario eseguire una suite di regressione rappresentativa, includendo almeno logica combinatoria e sequenziale, reset sincroni e asincroni, generics, package, gerarchie, FSM, memorie inferite e gli eventuali costrutti VHDL-2008 previsti dal corso. È inoltre opportuno confrontare simulazione RTL VHDL e simulazione della netlist generata, perché entrambi i percorsi GHDL-Yosys si basano su una funzionalità dichiarata sperimentale.

Per un eventuale collaudo successivo del plugin, senza installarlo globalmente prima della prova, i comandi da riesaminare sarebbero:

```bash
sudo apt-get install yosys yosys-dev libghdl-dev build-essential
git clone https://github.com/ghdl/ghdl-yosys-plugin.git
git -C ghdl-yosys-plugin checkout <COMMIT_VERIFICATO_E_BLOCCATO>
make -C ghdl-yosys-plugin GHDL=/usr/bin/ghdl YOSYS_CONFIG=/usr/bin/yosys-config
yosys -m ./ghdl-yosys-plugin/ghdl.so -p 'ghdl --std=08 Test/AND2.vhd -e AND2; prep -top AND2; check; stat'
```

Punti ancora da verificare dopo l'eventuale installazione autorizzata di Yosys:

- corretto caricamento in Yosys 0.52 del Verilog prodotto da GHDL 5.0.1 su una suite più ampia di `AND2`;
- equivalenza funzionale RTL/netlist e conservazione di reset, inizializzazioni, memorie, attributi e gerarchia richiesti dal corso;
- supporto effettivo dei costrutti VHDL-2008 che saranno ammessi agli studenti;
- formato di uscita richiesto dal futuro target FPGA/ASIC e relativo flusso di place-and-route;
- solo se il plugin diventerà necessario: esistenza reale della libreria dopo `libghdl-dev`, compilazione con gli header APT, caricamento di `ghdl.so` e regressione dopo aver fissato il commit.

## Milestone 1 ViVo (VHDL Interactive Virtual Objects)

Implementazione eseguita il 24 agosto 2026 sul branch Git `feature/vivo-m1`. In questa attività non è stato installato, aggiornato o modificato alcun programma di sistema; OSS CAD Suite non è stata installata.

### Funzionalità implementate

- Aggiunto il pulsante `ViVo` dopo `SINTESI GATE` nella barra `Design2RTL`.
- Il pulsante richiede un progetto e un top-level selezionati e apre `vivo.html` in una nuova finestra browser, lasciando invariata la finestra principale UFO.
- La finestra ViVo non contiene l'albero dei progetti e presenta soltanto le tre aree operative della milestone: `LIBRERIA ViVoO`, `DISEGNO` e `CONSOLE`.
- La libreria è volutamente vuota e mostra le intestazioni `INPUT` e `OUTPUT`.
- Il disegno costruisce automaticamente un blocco FPGA-like per l'entity selezionata, con il nome al centro, porte `in` a sinistra e porte `out`/`buffer` a destra.
- Il parser VHDL esistente è stato esteso per restituire nome, direzione e range delle porte. I vettori conservano, per esempio, `3 downto 0` e vengono mostrati nel blocco come `[3:0]`; i tipi `std_logic` e `std_logic_vector` non vengono mostrati.
- Le porte `inout` e `linkage` non vengono rappresentate come connessioni: sono segnalate nella console come non ancora supportate.

Rifinitura successiva della Milestone 1: il blocco è stato reso più compatto, mantenendo un unico rettangolo esterno senza divisori verticali. La scritta `FPGA` compare sopra il rettangolo e il nome reale dell'entity resta al centro. La console ViVo parte da un'altezza ridotta e dispone di un divisore trascinabile coerente con quello della console principale UFO. Il caricamento mostra il relativo messaggio soltanto fino alla disponibilità dei dati del design. Il parser non è stato modificato in questa rifinitura perché nome, direzione e range erano già disponibili nell'analisi esistente.

È stata poi corretta la composizione del blocco: il rettangolo centrale misura 160×160 pixel, mentre le porte sono disposte all'esterno sui due lati, con gli ingressi a sinistra e le uscite a destra. Il nome dell'entity viene inserito esplicitamente nel nucleo centrale usando i dati del top selezionato.

Correzione ulteriore: il rettangolo centrale è stato portato a 160×320 pixel. Il blocco resta nascosto in modo esplicito fino al completamento del rendering di entity e porte, evitando la visualizzazione di un FPGA vuoto. La maniglia della console è ora sopra il pannello, con cattura dei pointer event durante il trascinamento, così il ridimensionamento resta attivo anche uscendo con il puntatore dalla maniglia.

Per evitare che una finestra popup resti in attesa della chiamata API, `vivo.html` viene ora popolata dal server con i dati già ottenuti dall'analisi VHDL del top selezionato. JavaScript usa questi dati iniziali e mantiene il recupero API soltanto come fallback. In questo modo nome dell'entity e porte sono già presenti nel documento alla sua apertura.

La rifinitura grafica finale allinea la scritta `FPGA` al centro del solo rettangolo, usando la sua colonna nella griglia del disegno; le linee delle porte partono o terminano ora direttamente sull'etichetta, senza spazio aggiuntivo.

Le linee laterali delle porte sono state infine rese frecce: quelle degli ingressi puntano verso il rettangolo FPGA e quelle delle uscite puntano verso l'esterno.

La geometria delle porte è stata precisata: ogni etichetta ha una linea semplice a sinistra e una sola freccia a destra (`linea → nome → freccia`), evitando punte doppie.

Lo spessore della linea semplice e del gambo della freccia è stato uniformato a 2 pixel.

### Funzionalità escluse intenzionalmente

Non sono stati implementati oggetti ViVoO, drag&drop, connessioni, simulazione interattiva, GHDL stdin/stdout, Simulator Adapter, Switch, Push Button, LED, display, salvataggio del layout o supporto Verilog/Icarus. I flussi di sintesi, simulazione, `EXT_SIM`, editor e gestione progetti non sono stati modificati.

### Verifica

- Aggiunti test del parser per una entity con più ingressi, più uscite, porte scalari e porte vettoriali.
- Aggiunti controlli API per il pulsante ViVo e per la pagina dedicata con token e le tre aree.
- `npm test`: 23 test superati, 0 falliti.
- Verificato il design esistente `Test/RCA/RCA.vhd`, che contiene più ingressi/uscite e vettori.
- La rifinitura è stata verificata nuovamente sul top `RCA`: ingressi `A[3:0]`, `B[3:0]`, `CIN` e uscite `SUM[3:0]`, `COUT`; la suite completa resta a 23 test superati.

## Milestone 2 ViVo — Libreria ViVoO e oggetti nel disegno

Implementazione eseguita sul branch Git `feature/vivo-m1`, senza installare o aggiornare software.

### Funzionalità implementate

- La libreria `LIBRERIA ViVoO` è ora scrollabile e mostra le sezioni `INPUT` (Switch e Push Button) e `OUTPUT` (LED).
- Ogni tipo ViVoO è descritto dalla tabella comune `VIVOO_TYPES`, con `id`, etichetta, categoria, icona, prefisso e larghezza in bit. Switch e Push Button sono input a 1 bit; LED è output a 1 bit.
- Aggiunti gli asset locali sostituibili `immagini/vivo-switch.svg`, `immagini/vivo-button.svg` e `immagini/vivo-led.svg`, tutti con viewBox `0 0 48 48` e dimensionati via CSS.
- La selezione in libreria è evidenziata e abilita il pulsante `IMPORTA`; senza selezione il pulsante resta disabilitato.
- `IMPORTA` crea un'istanza grafica nell'area `DISEGNO`, con numerazione autonoma per tipo (`SW1`, `SW2`, `BTN1`, `LED1`, ...).
- Le istanze input vengono inizialmente collocate a sinistra della FPGA, quelle output a destra. Le nuove posizioni avanzano verticalmente per categoria, evitando sovrapposizioni immediate.
- Ogni istanza può essere trascinata liberamente con il mouse; il vincolo minimo mantiene una parte dell'oggetto all'interno dell'area di disegno. La FPGA non è trascinabile.

### Limiti intenzionali

Switch, Push Button e LED restano soltanto rappresentazioni grafiche: non sono associati ai pin FPGA, non hanno fili, bus, stato elettrico o simulazione GHDL. Non sono implementati drag&drop dalla libreria, editor dei nomi o salvataggio permanente del layout.

### Verifica

- I test API verificano la struttura della libreria, `IMPORTA` inizialmente disabilitato, la disponibilità dei tre SVG e la presenza della logica comune di importazione e trascinamento.
- La verifica headless della finestra ViVo sul design reale `Decoder2` conferma il rendering delle tre voci di libreria, delle relative icone e del blocco FPGA già popolato con porte multiple e vettoriali.
- `npm test`: 23 test superati, 0 falliti.

## Installazione e collaudo di Yosys

Installazione e verifica eseguite il 4 agosto 2026. Il primo tentativo avviato dalla sessione Codex si è fermato alla richiesta di autenticazione `sudo`; l'installazione è stata quindi eseguita manualmente dall'utente in un secondo terminale della stessa distribuzione WSL, con il comando:

```bash
sudo apt-get install --no-install-recommends yosys
```

Il registro `/var/log/apt/history.log` riporta il comando effettivo `apt-get install --no-install-recommends yosys`, richiesto dall'utente `feled`, e la conclusione regolare dell'operazione.

Pacchetti installati:

| Pacchetto | Versione | Motivo |
| --- | --- | --- |
| `yosys` | `0.52-2` | pacchetto richiesto |
| `yosys-abc` | `0.52-2` | dipendenza automatica obbligatoria |

`command -v yosys` restituisce `/usr/bin/yosys`; `yosys -V` restituisce `Yosys 0.52 (git sha1 fee39a3284c90249e1d9684cf6944ffbbcbb8f90)`. `dpkg-query` conferma per entrambi i pacchetti stato `ii`, architettura `amd64`; versione installata e candidata APT coincidono e provengono da Ubuntu 26.04 `resolute/universe`.

L'opzione APT `--no-install-recommends` ha escluso `xdot`. Le verifiche successive confermano inoltre che `nodejs`, `npm`, `yosys-dev`, `libghdl-dev` e qualsiasi pacchetto plugin GHDL-Yosys non sono stati installati.

### Artefatti prodotti

| File | Dimensione | SHA-256 | Descrizione |
| --- | ---: | --- | --- |
| `Test/AND2_synth.v` | 164 byte | `bb33e9e84000c84c1976c3a1e9de1bb4c385bf739c3445e478d54f29fa2b1a38` | netlist Verilog intermedia prodotta da GHDL |
| `Test/AND2_synth.json` | 1.988 byte | `5d5454569454fe9b0632e9d9ee6e4d618cd53c872bc2699aabb9b35a5108183b` | netlist JSON prodotta da Yosys |
| `Test/AND2_yosys.log` | 5.882 byte | `94ea44bc9152d4e4837e8cd0e2093a6fffd6c1a3320b060448127b175187ed7d` | log completo del caricamento, preparazione, controlli e generazione JSON |

I file VHDL già collaudati non sono stati modificati. Gli hash sono rimasti:

- `Test/AND2.vhd`: `55e5f58829798288858f33bf504a1d276997be2e1060a1939ce17a48052668ed`;
- `Test/AND2_tb.vhd`: `126d4652e884279954211f11ebf943ec6fa08c6c9c1d722a6f2d908e75617cd2`.

### Procedura di sintesi

Il primo comando tentato per richiedere direttamente il file di uscita è stato:

```bash
ghdl synth --std=08 --out=verilog -o Test/AND2_synth.v Test/AND2.vhd -e AND2
```

La build Ubuntu di GHDL 5.0.1 ha restituito codice 1 e l'errore non distruttivo `unknown command option '-o'`. La sintesi è stata quindi ripetuta senza `-o`, catturandone l'uscita standard e conservandola come `Test/AND2_synth.v`:

```bash
ghdl synth --std=08 --out=verilog Test/AND2.vhd -e AND2
```

Il secondo comando si è concluso con codice 0 e senza messaggi diagnostici. La netlist risultante definisce il modulo `AND2`, gli ingressi `a` e `b`, l'uscita `y` e l'assegnazione logica `a & b`.

Yosys è stato quindi eseguito con:

```bash
yosys -l Test/AND2_yosys.log -p 'read_verilog Test/AND2_synth.v; hierarchy -check -top AND2; prep -top AND2; check -assert; stat; write_json Test/AND2_synth.json'
```

Il comando si è concluso con codice 0. Il frontend Verilog-2005 ha caricato correttamente il modulo e il backend JSON ha prodotto il file richiesto.

### Verifiche e risultati

- `Test/AND2_synth.json` è JSON sintatticamente valido, non vuoto e ricaricabile dal frontend JSON di Yosys.
- Il modulo top è `AND2`; le porte sono `a` e `b` di tipo `input` e `y` di tipo `output`. VHDL non distingue maiuscole e minuscole, mentre GHDL ha emesso questi identificatori in minuscolo.
- La netlist contiene quattro wire da un bit, tre porte, zero memorie, zero processi ed esattamente una cella di tipo `$and`.
- Le connessioni `A`, `B` e `Y` della cella `$and` coincidono rispettivamente con i bit delle porte `a`, `b` e `y`.
- `check -assert` è stato eseguito sia prima della scrittura sia dopo la rilettura della JSON: entrambi i controlli riportano `Found and reported 0 problems`.
- Nel log non compaiono warning, errori, driver multipli o segnali non pilotati.
- La tabella di verità è stata verificata sulla JSON ricaricata tramite quattro comandi Yosys `eval`: `00 → 0`, `01 → 0`, `10 → 0`, `11 → 1`.

Comando usato per la verifica funzionale indipendente della netlist conservata:

```bash
yosys -p 'read_json Test/AND2_synth.json; hierarchy -check -top AND2; check -assert; eval -set a 0 -set b 0 -show y; eval -set a 0 -set b 1 -show y; eval -set a 1 -set b 0 -show y; eval -set a 1 -set b 1 -show y'
```

Esito complessivo: il flusso `VHDL → GHDL synth → Verilog → Yosys → JSON` è funzionante per il caso minimo `AND2`. L'unico errore incontrato è l'opzione locale `-o` non riconosciuta da GHDL; l'uso dell'uscita standard è un workaround completo per questa versione. Rimane valido il limite generale già documentato: questo test minimo non dimostra da solo la copertura di progetti sequenziali, memorie, generics o costrutti VHDL-2008 più complessi.

## Preparazione del flusso di visualizzazione RTL con netlistsvg

Analisi, installazione e collaudo eseguiti il 4 agosto 2026. OSS CAD Suite non è stata installata né utilizzata.

### Analisi preliminare e decisione

Prima di modificare il sistema sono state controllate la cache APT, una simulazione dell'installazione e le fonti ufficiali di netlistsvg.

| Componente | Versione disponibile durante l'analisi | Esito di compatibilità |
| --- | --- | --- |
| Node.js da Ubuntu `resolute/universe` | `22.22.1+dfsg+~cs22.19.15-1ubuntu1` | nessun conflitto APT; compatibilità runtime con netlistsvg confermata dal test finale |
| npm da Ubuntu `resolute/universe` | `9.2.0~ds3-1` | compatibile con Node.js 22 nella pacchettizzazione Ubuntu; installazione e lockfile riusciti |
| netlistsvg dal registro npm | `1.0.2` | il pacchetto non dichiara un campo `engines`; compatibilità con Node.js 22 non garantita dai metadati, ma verificata concretamente generando l'SVG |

La [pagina ufficiale npm di netlistsvg](https://www.npmjs.com/package/netlistsvg) indica la versione `1.0.2`, pubblicata sei anni prima della verifica, e documenta la conversione di una netlist JSON Yosys in SVG. Il [repository ufficiale](https://github.com/nturley/netlistsvg) suggerisce l'installazione globale per la CLI; tuttavia, per UFO-WA è stata scelta l'installazione **locale nel progetto**, con versione esatta, perché:

- `package.json` e `package-lock.json` rendono l'ambiente riproducibile per studenti e docenti;
- l'eseguibile è isolato in `node_modules/.bin` e non altera il namespace globale npm;
- non richiede `sudo` per installazione, aggiornamento o rimozione di netlistsvg;
- più versioni o futuri aggiornamenti possono essere valutati senza modificare l'intera WSL;
- `npm ci --ignore-scripts` potrà ricostruire l'albero fissato dal lockfile.

L'installazione globale non è quindi raccomandata per la baseline didattica. Il repository GitHub mostra ancora versione `1.0.2`, ma il suo `package.json` corrente elenca dipendenze più recenti rispetto al tarball `1.0.2` effettivamente pubblicato su npm. Questa divergenza e l'età del pacchetto rendono particolarmente importante conservare il lockfile e non installare implicitamente dal ramo `master`.

La simulazione APT ha mostrato che l'installazione congiunta di `nodejs` e `npm` richiede numerose dipendenze JavaScript impacchettate da Ubuntu. Tale volume è un limite della pacchettizzazione APT di npm, ma evita repository Node.js di terze parti e version manager aggiuntivi, risultando la scelta più uniforme per la WSL degli studenti.

### Installazione di Node.js, npm e netlistsvg

Poiché APT richiedeva autenticazione, l'utente ha eseguito manualmente in un secondo terminale:

```bash
sudo apt-get install --no-install-recommends nodejs npm
```

Il registro APT conferma il comando effettivo `apt-get install --no-install-recommends nodejs npm`, concluso regolarmente. Le versioni effettive sono:

- `/usr/bin/node`: `v22.22.1`;
- `/usr/bin/npm`: `9.2.0`;
- pacchetto `nodejs`: `22.22.1+dfsg+~cs22.19.15-1ubuntu1`, stato `ii`, architettura `amd64`;
- pacchetto `npm`: `9.2.0~ds3-1`, stato `ii`, architettura `all`.

È stato creato `package.json`, marcato `private`, con `netlistsvg` fissato esattamente a `1.0.2` fra le `devDependencies` e con lo script `rtl:and2`. L'installazione locale è stata eseguita dalla radice di UFO-WA con:

```bash
/usr/bin/npm install --ignore-scripts
```

Il primo tentativo nel sandbox non ha modificato l'albero e si è concluso con `EAI_AGAIN` per il blocco DNS verso `registry.npmjs.org`. Lo stesso comando è stato ripetuto dopo l'autorizzazione all'accesso di rete ed è terminato con codice 0: 71 pacchetti locali aggiunti e 72 pacchetti sottoposti ad audit. `--ignore-scripts` ha impedito l'esecuzione di script di installazione delle dipendenze.

Verifiche locali:

```bash
node -p "require('./node_modules/netlistsvg/package.json').version"
/usr/bin/npm ls --depth=0
```

Risultati: versione effettiva `1.0.2` e unico pacchetto diretto `netlistsvg@1.0.2`. La cartella `node_modules` occupa circa 22 MiB. netlistsvg non è stato installato globalmente.

### Generazione e verifica di `AND2.svg`

Comando eseguito tramite lo script locale, senza rete e senza privilegi:

```bash
/usr/bin/npm run rtl:and2
```

Lo script corrisponde a:

```bash
netlistsvg Test/AND2_synth.json -o Test/AND2.svg
```

Il comando si è concluso con codice 0 e senza warning o errori di rendering. Sono stati creati o conservati i seguenti elementi:

| Elemento | Dimensione | SHA-256 o contenuto rilevante |
| --- | ---: | --- |
| `package.json` | 277 byte | `6ac783a7e1692035fead50ee799b016552a99abe054c21ec8134860e62b56d55` |
| `package-lock.json` | 27.058 byte | `734f2c39a381371ca8e0ab5f94118f3fb1a912d10c1000d6cdd79ba37b84f24d` |
| `node_modules/` | circa 22 MiB | dipendenze locali bloccate dal lockfile |
| `Test/AND2.svg` | 2.111 byte | `33930945c1dae50584c306f37603ff2b5b97cb02c2e908795436a9f201fbf5bc` |

Verifiche effettuate su `Test/AND2.svg`:

- file presente, non vuoto e analizzabile come XML;
- elemento radice nel namespace SVG, dimensioni dichiarate `184 × 119`;
- due nodi di ingresso etichettati `a` e `b`;
- un unico nodo grafico con tipo netlistsvg `and` e alias `$and`, `$logic_and`, `$_AND_`;
- un nodo di uscita etichettato `y`;
- cinque segmenti di linea che collegano i due ingressi alla porta e la porta all'uscita;
- forma della porta AND presente come path SVG dedicato.

La sessione non ha potuto ottenere un'anteprima raster dal visualizzatore locale, che non ha elaborato direttamente il file SVG; la validazione è stata quindi eseguita sul documento XML, sui namespace, sui tipi dei nodi, sulle etichette e sulle connessioni. Tali controlli confermano strutturalmente lo schema `a,b → AND → y`.

### Avvisi di sicurezza e limiti

`npm audit --json`, eseguito senza applicare modifiche, segnala quattro vulnerabilità transitive: due moderate e due high, zero critical. Il tarball npm di netlistsvg 1.0.2 risolve in particolare:

- `json5@0.5.1`, interessato da `GHSA-9c47-m6qq-7p4h` (prototype pollution, high);
- `yargs@6.6.0` e `yargs-parser@4.2.1`, con `GHSA-p9pc-299p-vxgp` su `yargs-parser` (prototype pollution, moderate).

L'audit classifica `netlistsvg` come coinvolto e non offre una correzione completa automatica per il pacchetto diretto. Non è stato eseguito `npm audit fix` e non sono stati aggiunti override non supportati, per evitare modifiche non collaudate alle dipendenze di una CLI datata.

Per mitigare il rischio nella baseline attuale, netlistsvg deve essere usato soltanto offline su netlist JSON e skin provenienti dal flusso locale controllato GHDL/Yosys; non devono essere elaborati file JSON5, skin o layout forniti da soggetti non affidabili. Prima di distribuire definitivamente la WSL agli studenti è opportuno rivalutare gli advisory e verificare se upstream pubblica una nuova release con dipendenze corrette. L'uso riuscito con Node.js 22 dimostra la compatibilità del caso `AND2`, non garantisce ogni possibile schema complesso.

Gli hash di `Test/AND2.vhd`, `Test/AND2_tb.vhd`, `Test/AND2_synth.v`, `Test/AND2_synth.json` e `Test/AND2_yosys.log` sono rimasti invariati: nessun file VHDL o artefatto già collaudato è stato modificato.

## Analisi preliminare della WebApp

Analisi eseguita il 5 agosto 2026 senza creare file applicativi, senza installare o aggiornare software e senza modificare gli artefatti VHDL già collaudati. È stato esaminato anche `immagini/mockup.png`. La cartella prevista per i progetti, `/home/feled/Workspace` (`~/Workspace`), esiste ed è attualmente vuota.

### Inventario rilevato

La radice `~/UFO-WA` contiene:

| Elemento | Classificazione | Stato e funzione |
| --- | --- | --- |
| `AGENTS.md` | configurazione operativa | definisce indipendenza da UFO-CLI, divieto di OSS CAD Suite e divieto di installazioni in questa fase |
| `REPORT.md` | documentazione | registra installazioni, versioni, prove e decisioni tecniche già svolte |
| `immagini/mockup.png` | riferimento UI | mockup della WebApp con albero Workspace, editor centrale, console/output inferiore e azioni contestuali |
| `package.json` | configurazione Node.js | progetto privato, nessun componente Web; contiene soltanto lo script `rtl:and2` e `netlistsvg@1.0.2` come dipendenza di sviluppo esatta |
| `package-lock.json` | riproducibilità Node.js | lockfile npm versione 3, conserva l'albero transitivo esatto |
| `node_modules/` | dipendenze Node.js | circa 22 MiB; 71 pacchetti installati localmente, con `netlistsvg@1.0.2` come unica dipendenza diretta |
| `.git/`, `.agents/`, `.codex/` | cartelle nascoste | presenti ma vuote; la radice non è attualmente un worktree Git operativo |
| `Test/` | caso di prova e artefatti | flusso minimo AND2 già collaudato; non è una WebApp né la futura cartella dei progetti utente |

Classificazione dettagliata di `Test/`:

| Elemento | Categoria | Note |
| --- | --- | --- |
| `AND2.vhd` | sorgente VHDL di design | entity `AND2`, architettura combinatoria RTL |
| `AND2_tb.vhd` | testbench VHDL | entity `AND2_tb`, quattro combinazioni e asserzioni |
| `AND2_tb.vcd` | risultato di simulazione | forma d'onda VCD prodotta da GHDL |
| `work-obj08.cf` | artefatto temporaneo GHDL | catalogo della libreria `work`, standard VHDL-2008 |
| `AND2_synth.v` | artefatto intermedio di sintesi | Verilog emesso da `ghdl synth` |
| `AND2_synth.json` | artefatto di sintesi | netlist JSON emessa da Yosys |
| `AND2_yosys.log` | log di sintesi | output completo del flusso Yosys |
| `AND2.svg` | risultato grafico RTL | diagramma prodotto da netlistsvg |

Strumenti già installati e riutilizzabili, verificati in sola lettura:

| Strumento | Versione effettiva |
| --- | --- |
| GHDL | `5.0.1+dfsg-1ubuntu1`, backend mcode |
| GTKWave | `3.3.126-1` |
| Yosys | `0.52-2` |
| Node.js | `22.22.1` |
| npm | `9.2.0` |
| netlistsvg locale | `1.0.2` |

Non risultano file HTML, CSS o JavaScript applicativi, server HTTP, API, framework frontend/backend, configurazioni di build Web o test della WebApp. Non risultano altri script di progetto oltre a `rtl:and2`. Il flusso tecnico già verificato è:

```text
simulazione: VHDL + testbench -> GHDL -> VCD -> GTKWave
sintesi:     VHDL -> GHDL synth -> Verilog -> Yosys -> JSON -> netlistsvg -> SVG
```

GHDL 5.0.1 dispone già dei comandi `find-top` ed `elab-order` e dell'opzione di esecuzione `--disp-tree`. Sul caso presente, `find-top` individua correttamente `and2_tb` e `elab-order AND2_tb` restituisce `AND2.vhd` prima di `AND2_tb.vhd`. Questo conferma che gli strumenti possono assistere il rilevamento delle dipendenze, ma anche che un unico “top automatico” non basta: il top di simulazione è il testbench, mentre il top di sintesi è il design `AND2`.

### Requisiti proposti per la versione minima

1. All'avvio il backend risolve una sola volta `~/Workspace` nel percorso assoluto `/home/feled/Workspace`, ne verifica esistenza e permessi e non opera fuori da tale radice.
2. La UI elenca ogni sottocartella diretta di Workspace come progetto e permette “Nuovo progetto” ed “Elimina progetto”, con nomi validati, conferma esplicita e cancellazione inizialmente recuperabile tramite spostamento in un cestino UFO.
3. Per ogni progetto permette di creare un file `.vhd` vuoto o da modello minimale, caricare/copiare un file `.vhd`, aprirlo, modificarlo e salvarlo. Per l'MVP è sufficiente un editor testuale con numeri di riga; evidenziazione sintattica e completamento non sono prerequisiti.
4. Classifica design e probabili testbench usando unità VHDL analizzate, dipendenze, convenzioni quali `_tb` e assenza di porte. GHDL fornisce candidati, ordine di elaborazione e albero elaborato; l'utente deve poter confermare o correggere separatamente il testbench di simulazione e il top di sintesi quando il risultato è ambiguo.
5. La simulazione espone fasi didattiche distinte: controllo, analisi, elaborazione, esecuzione e generazione VCD. Mostra in console il comando concettuale, `stdout`, `stderr`, codice di uscita, durata ed esito, senza nascondere la diagnostica originale GHDL.
6. L'utente seleziona il testbench e un tempo massimo di simulazione entro limiti configurati. Il backend esegue GHDL con VHDL-2008, `--stop-time`, un timeout di processo e un file VCD in una cartella di risultato dedicata.
7. Nell'MVP il pulsante “Apri forme d'onda” avvia il GTKWave già installato come finestra WSLg separata. GTKWave non è incorporabile direttamente in una pagina Web; una visualizzazione nella stessa finestra del browser richiederebbe in seguito un visualizzatore VCD Web distinto.
8. La sintesi è un'azione separata dalla simulazione. Sul top di design selezionato esegue il flusso già collaudato `ghdl synth --out=verilog`, acquisisce l'uscita standard in un file Verilog, richiama Yosys per produrre JSON e infine il binario locale di netlistsvg per produrre SVG.
9. Il diagramma RTL SVG viene mostrato in un pannello o scheda del browser, con zoom e adattamento alla finestra. La netlist JSON e lo SVG sono risultati; il Verilog intermedio e i file di lavoro sono artefatti di build.
10. Ogni esecuzione conserva un identificatore, data/ora, versioni degli strumenti, top scelto, file e relativi hash, opzioni, comandi mostrati, log ed esito. Questo rende ripetibili i risultati e consente di spiegare allo studente ogni fase.
11. È ammesso un solo job GHDL/Yosys/netlistsvg alla volta per progetto nell'MVP. La UI consente di interromperlo e non avvia processi concorrenti sullo stesso albero di build.

### Architettura raccomandata

Raccomandazione: applicazione locale a processo singolo con **frontend HTML/CSS/JavaScript senza framework** e **backend Node.js senza framework Web**, usando inizialmente soltanto moduli standard (`http`, `fs`, `path`, `child_process`, stream ed eventi). Il server ascolta esclusivamente su `127.0.0.1`, serve gli asset statici e una piccola API JSON; gli aggiornamenti della console possono essere inviati con Server-Sent Events. Questa scelta riusa Node.js 22 già installato e non introduce dipendenze o runtime aggiuntivi.

Il layout segue il mockup:

- colonna sinistra: progetti e file del Workspace, con azioni crea, importa, elimina e ricerca;
- area centrale: editor e schede per forma d'onda/RTL;
- area inferiore: console didattica richiudibile con fasi, output originale, stato e pulsante di interruzione;
- intestazione: percorso Workspace, stato del backend e versioni degli strumenti.

Separazione dei dati proposta per ciascun progetto:

```text
~/Workspace/<progetto>/
  src/                         sorgenti e testbench VHDL modificabili
  results/
    simulation/<esecuzione>/   VCD, log e manifesto
    synthesis/<esecuzione>/    SVG, JSON, log e manifesto
  .ufo/
    build/<job>/               libreria GHDL, Verilog e temporanei sostituibili
    project.json               preferenze e ultime selezioni, non fonte tecnica
```

I file caricati sono prima acquisiti in una cartella di staging per job, sottoposti a controlli di nome, tipo, dimensione e percorso, quindi copiati in `src/` solo dopo conferma in caso di collisione. I risultati non vengono mescolati ai sorgenti e la pulizia dei temporanei non elimina i risultati conservati.

Il backend invoca esclusivamente percorsi di eseguibili fissati e verificati (`/usr/bin/ghdl`, `/usr/bin/yosys`, `/usr/bin/gtkwave` e `~/UFO-WA/node_modules/.bin/netlistsvg`) tramite `spawn`, con array di argomenti e senza shell. Per Yosys è preferibile generare uno script `.ys` controllato nella build directory, usando nomi di file interni validati, invece di concatenare input utente in `-p`. La console traduce il flusso in fasi didattiche, ma affianca sempre il messaggio originale e il codice di uscita.

Ogni processo deve avere directory di lavoro isolata, limite temporale, limite alla dimensione dell'output catturato e alla dimensione degli artefatti. Allo scadere il backend invia prima una terminazione ordinaria e poi forza la chiusura dell'intero gruppo di processi. GHDL deve avere anche `--stop-time`, perché il timeout di parete e il tempo simulato risolvono problemi diversi. Il backend elimina i temporanei incompleti oppure li marca come falliti e non li pubblica come risultati validi.

Per top-level e gerarchia si raccomanda un rilevamento assistito, non una supposizione basata soltanto sul nome del file:

1. importazione/analisi di tutti i `.vhd` nella libreria di lavoro isolata;
2. interrogazione delle unità e dei possibili top con GHDL;
3. uso di `elab-order` per l'ordine delle sorgenti;
4. uso dell'albero elaborato di GHDL per la simulazione e della gerarchia JSON Yosys per la sintesi;
5. selezione automatica solo se non ambigua, altrimenti scelta esplicita dell'utente.

Per la sicurezza locale, l'API deve rifiutare traversal, percorsi assoluti, nomi riservati e link simbolici che escono da Workspace; confrontare i percorsi reali con la radice consentita; imporre estensione e dimensione; non accettare script Yosys, skin netlistsvg o JSON arbitrari; applicare una Content Security Policy restrittiva; mostrare lo SVG prodotto attraverso un contesto che non esegua script; verificare `Origin` e usare un token casuale di sessione anche su localhost. L'eliminazione di un progetto non deve seguire link simbolici.

L'esecuzione di VHDL non è intrinsecamente sicura solo perché locale. Un file può causare elaborazioni o simulazioni interminabili, consumo di CPU, memoria o disco e, tramite funzioni di file I/O del linguaggio/runtime, tentare accessi con i permessi dell'utente che esegue UFO. Timeout, `--stop-time`, limiti di input/output, processo singolo e directory di lavoro riducono disponibilità e danni accidentali, ma **non costituiscono una sandbox di sistema**. L'MVP può essere dichiarato adatto a file creati dallo studente o provenienti da fonti fidate; prima di promettere l'esecuzione sicura di VHDL non fidato serve una decisione separata su isolamento OS e limiti di risorse.

netlistsvg 1.0.2 è datato e l'audit già registrato il 4 agosto 2026 segnala quattro vulnerabilità transitive: due moderate e due high. In particolare `json5@0.5.1` è interessato da [GHSA-9c47-m6qq-7p4h](https://github.com/advisories/GHSA-9c47-m6qq-7p4h) e `yargs-parser@4.2.1` da [GHSA-p9pc-299p-vxgp](https://github.com/advisories/GHSA-p9pc-299p-vxgp). Il primo rischio cresce se si accettano skin/JSON5 non fidati; il secondo richiede controllo sugli argomenti CLI. Nell'architettura proposta entrambi restano sotto controllo del backend, la netlist proviene esclusivamente da Yosys e si usa la skin incorporata. Ciò riduce l'esposizione ma non corregge le dipendenze vulnerabili. Non va eseguito `npm audit fix` alla cieca: prima dello sviluppo occorre una prova isolata di una release, fork o sostituto mantenuto, mantenendo nel frattempo versione e lockfile esatti. La pagina npm continua a indicare `1.0.2`, pubblicata sei anni fa, come versione disponibile: [netlistsvg su npm](https://www.npmjs.com/package/netlistsvg).

### Alternativa considerata

Unica alternativa architetturale considerata: frontend ugualmente privo di framework con backend **Python 3 standard library**. `subprocess` e la gestione dei timeout sono adatti e Python è già una dipendenza del sistema Yosys, ma questa scelta introdurrebbe un secondo ambiente applicativo mentre netlistsvg richiede comunque Node.js. Non offre un vantaggio sufficiente per l'MVP locale; resta sensata solo se la futura logica di analisi VHDL o gestione dei job diventasse molto più articolata. La raccomandazione rimane Node.js standard library.

### Rischi e questioni ancora da decidere

- **Visualizzazione forme d'onda:** approvare GTKWave in finestra WSLg separata per l'MVP oppure autorizzare in seguito la valutazione e l'eventuale aggiunta di un visualizzatore VCD Web per l'integrazione nel browser.
- **Struttura dei progetti:** approvare `src/`, `results/` e `.ufo/` all'interno di ogni cartella progetto, oppure richiedere sorgenti direttamente nella radice del progetto. La struttura separata è raccomandata.
- **Cancellazione:** definire durata e posizione del cestino recuperabile UFO e l'azione esplicita per lo svuotamento definitivo.
- **Top-level:** approvare il modello “rilevamento automatico con conferma/override” e stabilire se la convenzione `_tb` debba essere raccomandata o obbligatoria.
- **Limiti didattici:** fissare standard VHDL iniziale, tempo simulato predefinito/massimo, timeout reale, dimensione massima dei file, del VCD e dei log. VHDL-2008 è raccomandato perché coincide con gli artefatti collaudati.
- **Confine di fiducia:** decidere se l'MVP accetta soltanto file dello studente/fonti fidate. Se deve accettare file realmente non fidati, l'isolamento OS diventa requisito prima del rilascio e potrebbe richiedere software o configurazioni non ancora autorizzati.
- **netlistsvg:** decidere se accettare temporaneamente la versione bloccata 1.0.2 con input controllati oppure aprire una fase separata di valutazione di fork/sostituti. Nessun aggiornamento deve avvenire senza regressione sulla suite RTL.
- **Conservazione dei risultati:** stabilire quanti run mantenere, soglia massima di spazio e modalità di pulizia; la cancellazione automatica non deve coinvolgere i sorgenti.

Non sono state prese decisioni irreversibili. Prima dell'implementazione devono essere approvati almeno struttura del progetto, modalità di visualizzazione VCD, confine di fiducia e limiti di esecuzione.

## Prima versione funzionante della WebApp UFO

Implementazione completata sul branch `feature/ufo-v1` il 5 agosto 2026, riprendendo il checkpoint `b121a79` e senza modificare i file di riferimento sotto `Test/`. L'architettura approvata è stata mantenuta: frontend HTML/CSS/JavaScript, backend Node.js 22 basato sulle API standard, server limitato a `127.0.0.1`, nessun database e nessun framework applicativo.

### Componenti realizzati

| Componente | Percorso | Funzione |
| --- | --- | --- |
| CLI (Command-Line Interface) | `src/cli.js`, `src/config.js` | avvio, `--projects-root`, `UFO_PROJECTS_ROOT`, porta e default `~/Workspace` |
| sicurezza filesystem | `src/path-guard.js` | confinamento alla radice, rifiuto traversal, link simbolici e nomi non validi |
| analisi VHDL | `src/vhdl.js` | elenco sorgenti, entity, testbench candidati e gerarchia diretta |
| job runner | `src/jobs.js` | GHDL, VCD, GTKWave, GHDL synth, Yosys, netlistsvg, timeout, interruzione, log e manifesti |
| server HTTP | `src/server.js` | API JSON, token locale, CRUD, asset statici e risultati |
| UI | `public/index.html`, `public/styles.css`, `public/app.js` | albero progetti, schede, Monaco Editor, selettori, console, SVG RTL |
| test | `test/*.test.js` | sicurezza, API, gerarchia RCA e integrazione AND2 |

La gestione dei progetti nuovi usa `src/`, `results/` e `.ufo/build/`; i progetti legacy con sorgenti nella radice, come `Test/AND2` e `Test/RCA`, restano supportati. File e progetti vengono spostati in cestini recuperabili. Un singolo job è ammesso per progetto.

### Dipendenze e installazione

È stata aggiunta soltanto la dipendenza locale:

| Pacchetto | Versione | Motivo |
| --- | --- | --- |
| `monaco-editor` | `0.56.0` | editor browser locale con tokenizer VHDL e tema UFO |

`netlistsvg@1.0.2` era già presente e non è stato aggiornato. L'installazione è stata eseguita con `npm install --save-exact --ignore-scripts monaco-editor@0.56.0`, senza installazioni globali e senza `sudo`. Il lockfile è stato aggiornato. npm ha segnalato sei vulnerabilità nell'albero (una low, tre moderate, due high); non è stato eseguito `npm audit fix`, perché la catena legacy appartiene principalmente alle dipendenze già note di netlistsvg e richiede una regressione separata.

### Verifiche eseguite

- `npm test`: **11 test superati, 0 falliti**;
- test API su porta temporanea `127.0.0.1`, eseguito con autorizzazione locale;
- test di traversal, percorsi assoluti, link simbolici, token e Origin;
- test di creazione, lettura, modifica, rinomina ed eliminazione recuperabile;
- analisi gerarchica RCA: top-level `RCA`, catena `RCA → FA → HA`, testbench `RCA_tb`;
- collaudo AND2 in copia temporanea: simulazione GHDL con VCD e sintesi GHDL → Verilog → Yosys → JSON → netlistsvg → SVG;
- hash dei sorgenti `Test/AND2` invariati dopo il collaudo;
- controllo visivo headless con Microsoft Edge già presente: layout coerente con il mockup, con intestazione, Workspace laterale, barra dei comandi, area editor e console inferiore.

### Limiti ancora aperti

- GTKWave viene aperto in una finestra WSLg separata; non esiste ancora un visualizzatore VCD incorporato nel browser.
- L'esecuzione di VHDL non è una sandbox OS completa: la versione è destinata a file dello studente o fidati e usa timeout/limiti per ridurre i rischi.
- Il rilevamento automatico propone entity e gerarchia diretta; top-level e testbench restano selezionabili esplicitamente in caso di ambiguità o istanziazioni VHDL non dirette.
- Il tokenizer VHDL di Monaco è essenziale e non sostituisce un language server o un compilatore.
- La correzione degli advisory netlistsvg è rinviata: qualsiasi aggiornamento o sostituto richiede una nuova regressione dei risultati RTL.

## Correzioni UI successive al primo collaudo

Feedback ricevuto dopo il primo avvio della WebApp e corretto il 5 agosto 2026:

- la selezione di un progetto espande ora l'albero e apre automaticamente il primo sorgente VHDL nell'editor Monaco; le schede restano disponibili per più file;
- l'albero laterale usa le entity e le istanze rilevate dal backend: per RCA mostra `RCA → FA → HA`, mentre i testbench sono raccolti in un gruppo separato;
- il simbolo iniziale a forma di fulmine è stato sostituito da un logo CSS a disco volante, coerente con il mockup.

La verifica dei dati via API conferma per RCA `recommendedTop=RCA`, `recommendedTestbench=RCA_tb` e la gerarchia diretta `RCA → FA → HA`. I file di riferimento non sono stati modificati.

È stato inoltre corretto il pannello di benvenuto dell'editor: la regola CSS per l'attributo HTML `hidden` ora impone `display: none`, evitando che il pannello restasse sopra il modello Monaco quando il tab di un file veniva aperto.

La sidebar è stata poi resa associativa: il testbench con nome `<entity>_tb` viene mostrato subito sotto il relativo design, alla stessa indentazione; le istanze ripetute sono deduplicate per mantenere leggibile l'albero. Per RCA l'ordine visuale previsto è `RCA.vhd`, `RCA_tb.vhd`, quindi `FA.vhd`, `FA_tb.vhd` a un livello più interno, e `HA.vhd`, `HA_tb.vhd` al livello successivo. I testbench senza design corrispondente restano in un gruppo separato.

Per ridurre il rumore visivo, la sidebar mostra ora soltanto il nome del file (la convenzione didattica mantiene normalmente il nome dell'entity uguale al file). I file VHDL e il relativo indicatore `VHDL` usano il colore celeste; i testbench mantengono colore coerente tra indicatore `TB` e nome del file.

La barra operativa è stata riorganizzata in due righe: in alto `Design2RTL` con `SINTESI RTL`, in basso `Testbench` con `SIMULA`, `GTKWAVE` e `INTERROMPI`. Il campo `Stop time` è stato rimosso dall'interfaccia e la simulazione usa il limite predefinito di `1us`; il backend continua comunque a validare il parametro per le chiamate API. Il diagramma SVG della sintesi viene aperto in una nuova finestra del browser, non più nell'area dell'editor.

Il riferimento grafico `immagini/barra.png` ha inoltre precisato il layout: ciascuna riga usa l'ordine fisso label, menu e pulsante, con controlli allineati, sottili e di dimensioni tipografiche coerenti.

L'analisi VHDL per la classificazione dei candidati è stata documentata in modo esplicito: UFO ignora i commenti, individua le entity e verifica la presenza di `port(...)` nella dichiarazione. Un'entity è classificata come testbench se il nome termina con `_tb` oppure se non ha porte; il nome del file da solo non determina quindi la categoria. Le istanze dirette `entity work.NOME` vengono usate separatamente per ricostruire la gerarchia e proporre il top-level. La sidebar usa la convenzione `<nome-design>_tb` solo per l'associazione visuale tra design e testbench.

La selezione nella sidebar è stata resa non invasiva: il clic singolo su un progetto aggiorna solo selezione ed espansione, senza aprire file nell'editor; il clic singolo su un file lo seleziona, mentre il doppio clic lo apre.

La `CONSOLE` dispone ora di un divisore trascinabile sul bordo superiore, che consente di variare l'altezza durante la scrittura del codice senza modificare il layout dell'editor.

È stato inoltre ridotto lo spazio tra le label `DESIGN2RTL`/`TESTBENCH` e i rispettivi menu. La finestra di input dei nomi ora tratta il tasto `Invio` come conferma esplicita, evitando che la creazione di un progetto venga annullata accidentalmente dal comportamento predefinito del form.

L'editor dispone ora anche di un pulsante visibile `SALVA` accanto alle schede, oltre al comando `Ctrl+S` già disponibile.

L'icona UFO CSS è stata affinata usando `immagini/ufo.png` come solo riferimento visivo: scafo, cupola e luci sono disegnati localmente e non dipendono dall'immagine raster.

Gli esempi SVG `immagini/project.svg`, `immagini/vhdl.svg` e `immagini/testbench.svg` sono ora usati direttamente nella sidebar per progetto, sorgenti VHDL e testbench; `immagini/ufo.svg` è usato per il marchio e la schermata iniziale. Il server locale espone esclusivamente questi asset dalla cartella `immagini/`.

Il sottotitolo dell'intestazione esplicita ora l'acronimo: `UFO — Unified File Orchestrator`. Nella schermata iniziale `VHDL Learning Workbench` compare sotto il logo centrale, prima dell'istruzione per aprire un file.

Il pulsante separato `GTKWAVE` è stato rimosso dalla barra: al completamento positivo della simulazione UFO avvia automaticamente GTKWave. Se l'avvio grafico fallisce, la simulazione resta disponibile e l'errore viene comunicato all'utente.

All'apertura della WebApp la `CONSOLE` parte ora dall'altezza minima, così l'editor dispone subito dello spazio principale; il divisore consente di ampliarla manualmente.

Il sigillo monocromatico `immagini/sigillo-unipr.svg` è stato spostato nella barra operativa superiore, allineato a destra e ingrandito, con una tinta celeste attenuata tramite CSS. Il piè di pagina della sidebar mantiene soltanto i pulsanti operativi, così da preservarne l'altezza.

I nuovi progetti salvano i file VHDL nella sottocartella `src/`; la UI non espone all'utente la scelta del percorso. La compatibilità con progetti preesistenti che usano sorgenti direttamente nella radice resta invariata; il backend preferisce `src/` quando è la directory sorgente strutturata e usa la radice per i progetti legacy.

## Configurazione Git e baseline iniziale

Configurazione avviata il 5 agosto 2026 senza installare software e senza creare file applicativi. Git è già installato nella versione `2.53.0`.

### Stato rilevato prima dell'inizializzazione

- `~/UFO-WA` non era un repository Git operativo; la cartella `.git` preesistente era vuota.
- Non esistevano commit, branch, remote, file tracciati o modifiche Git pregresse.
- Il nome e l'e-mail dell'autore non erano configurati né per il repository, né globalmente, né a livello di sistema; l'utente ha successivamente fornito entrambi i valori e ne ha autorizzato la configurazione limitata al repository UFO-WA.
- Non sono stati configurati remote e non è stato effettuato alcun collegamento a GitHub.
- Il repository locale è stato inizializzato con `main` come branch iniziale.
- L'identità dell'autore è configurata soltanto nel repository locale; la configurazione Git globale e quella di sistema non sono state modificate.

La cartella `Test/` è ora organizzata in due progetti:

- `Test/AND2/`: caso minimo già collaudato, con design, testbench, VCD, Verilog e JSON di sintesi, log Yosys e SVG RTL;
- `Test/RCA/`: caso gerarchico con `HA`, `FA` e `RCA`, relativi testbench e numerosi output locali generati da esecuzioni precedenti.

### Controllo dei dati da versionare

La ricerca per nomi e pattern tipici non ha individuato password, token, chiavi private, credenziali, file `.env`, certificati o archivi di password. `REPORT.md` contiene percorsi e informazioni tecniche già documentate. I log e gli script di run generati sotto `Test/RCA/.ufo/`, oltre a `.ufo_terminal.log`, contengono percorsi locali e sono stati esclusi: non sono script sorgente del progetto.

Sono inoltre presenti numerosi metadati Windows `Zone.Identifier`; sono locali, estranei ai contenuti tecnici e non saranno versionati.

### Regole di esclusione

È stato creato `.gitignore` con questi criteri:

- esclusione di `node_modules/`;
- esclusione di file temporanei, cache, configurazioni IDE e metadati del sistema operativo;
- esclusione di `.env`, configurazioni locali, file di chiavi e configurazioni di package manager che potrebbero contenere credenziali;
- esclusione delle librerie di lavoro GHDL `work-obj*.cf` e delle directory di lavoro GHDL;
- esclusione delle future directory `.ufo/build/`, dei log/run locali UFO e delle directory `results/` generate;
- esclusione generale di log, VCD, SVG, netlist intermedie, oggetti e binari generati;
- eccezioni esplicite per gli artefatti collaudati di `Test/AND2/` conservati come riferimenti documentati.

### Criteri della baseline

La baseline deve includere:

- `AGENTS.md`, `.gitignore`, `REPORT.md` e i riferimenti grafici in `immagini/`;
- `package.json` e `package-lock.json`, senza `node_modules/`;
- tutti i sorgenti e testbench VHDL di `Test/AND2/` e `Test/RCA/`;
- gli artefatti AND2 documentati `AND2.svg`, `AND2_synth.json`, `AND2_synth.v`, `AND2_tb.vcd` e `AND2_yosys.log`.

Non devono essere inclusi gli output generati RCA, i binari GHDL, i file oggetto, le librerie di lavoro, i log/run locali o i metadati `Zone.Identifier`. Prima del commit l'elenco effettivo sarà verificato con Git e sottoposto a un secondo controllo di contenuti sensibili.

## Avvio automatico di UFO-WA in WSL-FeLED

Il 5 agosto 2026 è stato aggiunto a `/home/feled/.alias` l'avvio automatico di UFO-WA per la prima shell interattiva di ogni sessione WSL. Lo script:

- usa il progetto `/home/feled/UFO-WA` e il comando `npm start`;
- verifica prima se `http://127.0.0.1:8080` è già raggiungibile;
- usa un lock in `/tmp` per evitare avvii concorrenti da piu' terminali;
- avvia il servizio in background con log persistente in `/home/feled/.ufo-wa.log`;
- attende la risposta del server e apre l'URL in Microsoft Edge tramite il percorso Windows verificato, usando `explorer.exe` come fallback;
- apre Edge anche se il servizio risulta già attivo, così una nuova shell può ripristinare la finestra della WebApp dopo che il browser è stato chiuso.

Prima della modifica sono state verificate le dipendenze già disponibili: Node.js `v22.22.1`, npm `9.2.0`, curl `8.18.0`, flock (util-linux) `2.41.3` e interoperabilità WSL tramite `/mnt/c/WINDOWS/explorer.exe`. Non è stato installato alcun software.

Il 5 agosto 2026 è stato corretto il caso in cui `_ufo_wa_autostart` terminava regolarmente con il messaggio della shell `Done`, ma non apriva alcuna finestra: la verifica ha mostrato UFO già in ascolto su `127.0.0.1:8080` (risposta HTTP 200), mentre il ramo "servizio già attivo" usciva prima dell'apertura del browser. Microsoft Edge è stato individuato in `/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; la funzione ora lo avvia esplicitamente in entrambi i rami. La modifica non ha installato né aggiornato software.

Un controllo successivo dello stesso 5 agosto 2026 ha individuato un difetto nel lock di avvio: il descrittore aperto da `flock` veniva ereditato dai processi persistenti `npm` e Microsoft Edge, perciò poteva restare occupato anche dopo la conclusione della funzione di avvio. In `/home/feled/.alias` il descrittore del lock viene ora chiuso esplicitamente prima di eseguire sia `npm start` sia Edge o `explorer.exe`. Una vecchia istanza avviata con la configurazione precedente è stata arrestata per rendere effettiva la modifica. Il collaudo con una nuova shell WSL interattiva ha confermato risposta HTTP 200 su `http://127.0.0.1:8080`, presenza del processo `node src/cli.js` e rilascio del lock dopo l'avvio. Non è stato installato né aggiornato software.

Sempre il 5 agosto 2026 è stato aggiunto `disown` subito dopo `_ufo_wa_autostart &` in `/home/feled/.alias`. La funzione di avvio viene così rimossa dalla tabella dei job della shell e Bash non mostra più la notifica `[1]+ Done _ufo_wa_autostart` quando termina. La sintassi del file è stata verificata con `bash -n`; non è stato installato né aggiornato software.

La radice dei progetti dell'autostart è ora definita esplicitamente dalla variabile `UFO_WA_PROJECTS_ROOT` in `/home/feled/.alias`, impostata al default `/home/feled/Workspace`; il comando `npm start` riceve il valore tramite `--projects-root`. Per usare `Test` o un'altra cartella è sufficiente modificare quella singola variabile. Non è stato installato né aggiornato software.

In seguito è stata rimossa l'opzione `--new-window` dall'invocazione di Microsoft Edge in `/home/feled/.alias`. Edge riceve ora direttamente l'URL di UFO: se non è aperto crea una finestra con la WebApp, mentre se è già attivo riutilizza la sessione esistente senza forzare una seconda finestra vuota. La modifica non ha installato né aggiornato software.

## Arresto del servizio dalla WebApp

Il 7 agosto 2026 è stato aggiunto il pulsante breve `QUIT` nel piè di pagina della sidebar. Il pulsante invia una richiesta autenticata all'endpoint locale `POST /api/shutdown`; UFO interrompe ordinatamente gli eventuali job GHDL/Yosys, chiude il server HTTP e, nell'avvio normale da `src/cli.js`, termina il processo Node come un `Ctrl-C`. La scelta iniziale dell'etichetta `STOP` è stata sostituita con `QUIT` perché comunica meglio la chiusura della WebApp e della relativa scheda. Non è stato installato né aggiornato software.

Dopo la risposta di arresto la WebApp sostituisce il contenuto della pagina con un messaggio di servizio arrestato e tenta di chiudere la scheda con `window.close()`. I browser possono impedire la chiusura automatica di una scheda aperta normalmente; in quel caso il messaggio indica all'utente di chiuderla manualmente. Il test API verifica sia la risposta autenticata sia l'indisponibilità successiva del server.

## Generazione di design e testbench dai template

Il 7 agosto 2026 il pulsante `＋ VHDL` è stato esteso per chiedere il nome della ENTITY di design invece del nome di un singolo file. UFO legge `Template/Template.vhd` e `Template/Template_tb.vhd`, sostituisce `$NOME` con il nome inserito e `$NOME_tb` con il nome seguito da `_tb`, quindi crea insieme `<nome>.vhd` e `<nome>_tb.vhd`. Il nome deve essere un identificatore VHDL valido e non può terminare con `_tb`; i file già esistenti non vengono sovrascritti. L'importazione continua invece a gestire file singoli.

La creazione usa un endpoint dedicato e annulla il primo file se la scrittura del secondo fallisce. I template forniti contengono porte e istanziazione diretta `entity work.$NOME`, perciò il design generato viene riconosciuto come design e il testbench viene associato automaticamente. Non è stato installato né aggiornato software.

## Strutturazione dei sorgenti nei progetti

Il 7 agosto 2026 è stata resa effettiva la separazione dei sorgenti nella directory `src/` per i progetti nuovi. Creazione da template e importazione usano automaticamente la directory sorgente del progetto; i progetti legacy con file VHDL nella radice continuano a essere letti e aggiornati senza migrazione obbligatoria. La directory `src/` vuota di un nuovo progetto viene ora riconosciuta come directory sorgente anche prima della creazione del primo file. Non è stato installato né aggiornato software.

Per mantenere trasparente questa organizzazione allo studente, i selettori `Design2RTL` e `Testbench` mostrano soltanto il nome del file (`nome.vhd` o `nome_tb.vhd`) e non il prefisso interno `src/`.

La funzione `IMPORTA` accetta ora più file `.vhd` o `.vhdl` nella stessa selezione. UFO valida tutti i file prima della scrittura, li importa nella directory sorgente con i nomi originali e annulla l'operazione se si verifica un conflitto o un errore, evitando risultati parziali.

## Scroll del Workspace e altezza della Console

Il 7 agosto 2026 è stato corretto il layout quando il Workspace contiene molti progetti. I vincoli minimi dei contenitori della griglia sono ora azzerati e la riga dell'albero usa `minmax(0, 1fr)`: l'elenco mantiene quindi un'altezza interna limitata alla sidebar e mostra il proprio scroll verticale. La sidebar non può più allungare la pagina e la Console resta confinata nell'area del workbench, senza seguire l'estensione dell'elenco progetti. Non è stato installato né aggiornato software.

## Icona del progetto aperto

Il 10 agosto 2026 l'albero di navigazione è stato aggiornato per usare `immagini/project-open.svg` quando un progetto è espanso e mostra il proprio albero dei file. Quando il progetto viene richiuso, l'icona torna automaticamente a `immagini/project.svg`; il comportamento usa lo stesso stato `state.expanded` del caret, senza modifiche al backend. Non è stato installato né aggiornato software.

## Modalità di simulazione esterna EXT_SIM

Il 12 agosto 2026 è stata aggiunta la modalità opzionale `EXT_SIM` nella WebApp. La checkbox è disattivata per impostazione predefinita; quando resta disattivata il percorso di simulazione batch di UFO-WA non cambia e continua a gestire direttamente GHDL e l'apertura di GTKWave.

Quando `EXT_SIM` è attiva, UFO prepara la normale directory di build e copia gli stessi sorgenti, quindi genera `interactive-simulation.sh` nella directory temporanea del job. Lo script esegue nel Windows Terminal l'intera sequenza GHDL già usata dal backend: `ghdl -i`, `ghdl elab-order`, `ghdl -m` e `ghdl -r` con gli stessi parametri, percorsi VCD, `--stop-time` e `--disp-tree=inst`. Ogni fase successiva viene eseguita soltanto se la precedente termina con successo.

Lo script stampa un separatore `UFO-WA EXT_SIM - SIMULAZIONE ESTERNA` prima della prima fase, per distinguere visivamente nel terminale l'avvio del flusso esterno.

Il separatore `UFO-WA EXT_SIM - INIZIO OUTPUT TESTBENCH` viene inoltre inserito durante `ghdl -r`, dopo l'albero `--disp-tree=inst` e prima del primo prompt/output del testbench. Le righe del separatore usano `CRLF`, così il cursore del terminale torna a colonna zero anche nell'output proveniente dal pseudo-terminale. GHDL viene eseguito tramite `script` di util-linux, che gli assegna un pseudo-terminale: in questo modo `stdout` mantiene il comportamento interattivo della console anche se il relativo output passa poi dal filtro. Dopo l'inserimento del separatore il filtro inoltra direttamente ogni blocco ricevuto, così anche i prompt successivi, privi di newline, vengono visualizzati prima dell'inserimento dell'utente.

In caso di errore lo script stampa il codice di uscita e attende l'input dell'utente prima di chiudere il terminale, così il messaggio di GHDL resta leggibile. Dopo un `ghdl -r` riuscito verifica che il VCD esista e non sia vuoto, quindi avvia GTKWave sul file prodotto. Il job UFO rappresenta soltanto l'avvio del launcher: non attende la simulazione esterna e non tenta di aprire nuovamente GTKWave dalla WebApp.

La modalità usa `wt.exe` già disponibile nell'ambiente e non installa software o dipendenze. Non usa `wt.exe --wait`, perché la prova eseguita nell'ambiente WSL ha mostrato che quel flag non attende il processo interno e non propaga il relativo exit code. Non è quindi disponibile una sincronizzazione tra UFO-WA e la fine della simulazione esterna.

Il 12 agosto 2026 è stato corretto l'avvio del terminale esterno: Windows Terminal riceve ora la distribuzione WSL e l'utente attivi tramite `WSL_DISTRO_NAME` e `USER`, invece di usare la distribuzione WSL predefinita di Windows. Il launcher usa inoltre una directory corrente Windows (`/mnt/c/Windows`) e non trasferisce più a `wt.exe` il percorso Linux della build, che veniva convertito in un UNC `\\wsl.localhost\\...` non traducibile. Non è stato installato né aggiornato software.

Il 13 agosto 2026 il rilevamento della destinazione EXT_SIM è stato reso indipendente dalle variabili d'ambiente della shell che avvia Node. UFO-WA cerca esattamente `WSL-FeLED` tramite `wsl.exe --list --quiet`, normalizzando anche BOM, NUL, CRLF e marcatori di distro predefinita, quindi determina separatamente l'utente con `wsl.exe --distribution WSL-FeLED --exec whoami`. I log del job mostrano entrambe le rilevazioni; non è stato installato né aggiornato software.

## Pipeline Yosys per diagrammi combinatori didattici

Il 12 agosto 2026 la pipeline RTL di `src/jobs.js`, nella funzione `JobManager.runSynthesis()`, è stata aggiornata soltanto dopo `read_verilog`, `hierarchy -check -top` e `prep -top`. Lo script controllato `synthesis.ys` nella directory di build esegue ora `pmuxtree`, `simplemap` e `abc`, quindi `write_json netlist.json`. Restano invariati la sintesi GHDL `ghdl synth --out=verilog`, il formato JSON e la conversione JSON → SVG tramite netlistsvg.

È stata aggiunta una regressione integrata con un design VHDL combinatorio descritto tramite `case`. Il test verifica la sequenza esatta dello script `.ys`, l'assenza di `$pmux` nel JSON finale e l'accettazione del JSON da netlistsvg con produzione di un SVG non vuoto. Il collaudo AND2 esistente continua inoltre a verificare simulazione, sintesi, JSON e SVG.

La suite completa eseguita il 12 agosto 2026 ha prodotto 19 test superati su 19. Non è stato installato né aggiornato software.

## Modalità di sintesi RTL e GATE

Il 14 agosto 2026 la sintesi disponibile nella WebApp è stata separata in due modalità affiancate. Il pulsante esistente è ora denominato `SINTESI GATE` e conserva la pipeline precedente: `read_verilog`, `hierarchy -check`, `prep`, `pmuxtree`, `simplemap`, `abc` e `write_json`. Il nuovo pulsante `SINTESI RTL` usa gli stessi sorgenti GHDL, lo stesso top-level e lo stesso sistema di job, ma omette `pmuxtree`, `simplemap` e `abc`, lasciando a Yosys la netlist RTL ad alto livello.

La modalità viene passata al backend come parametro (`rtl` o `gate`) e la composizione dello script Yosys è condivisa; l’assenza del parametro mantiene compatibilità con il comportamento precedente e seleziona `gate`. La conversione JSON → SVG tramite netlistsvg è rimasta comune alle due modalità. Il manifesto del job registra inoltre la modalità usata.

Sono stati aggiornati i test automatici per verificare:

- i due script Yosys, inclusa l’assenza dei passaggi di mapping nella modalità RTL;
- la presenza di `$pmux` nella netlist RTL del design VHDL con `case` e la sua assenza nella netlist GATE;
- JSON validi e SVG non vuoti per entrambe le modalità;
- la presenza e l’ordine dei pulsanti `SINTESI RTL` e `SINTESI GATE` nella UI;
- la regressione AND2 esistente e tutte le altre funzionalità del progetto.

La suite completa eseguita il 14 agosto 2026 ha prodotto 21 test superati su 21. Non è stato installato né aggiornato software.

È stata inoltre eseguita una verifica end-to-end sul progetto reale `Decoder`, top-level `Decoder2`, dopo il riavvio del servizio UFO-WA. Il job RTL ha prodotto uno script senza mapping, una netlist JSON contenente `$pmux` e un SVG di 54.136 byte; il job GATE ha prodotto lo script completo con `pmuxtree`, `simplemap` e `abc`, una netlist senza `$pmux` e un SVG di 46.272 byte. Gli hash dei due SVG risultano differenti.

## ViVoO: stati grafici e associazione locale ai pin FPGA

Il 25 agosto 2026 è stata completata la parte esclusivamente grafica dei ViVoO, senza collegamento a GHDL, stdin/stdout, simulazione, clock, display, fan-out o persistenza del layout.

- Sono stati aggiunti sei SVG sostituibili e indipendenti dalla logica: Switch `off/on`, Push Button `up/down` e LED `off/on`. La libreria visualizza lo stato neutro; nel disegno l'asset mostrato cambia con lo stato locale.
- Le istanze INPUT sono create a sinistra della FPGA e quelle OUTPUT a destra, con distanza visiva dal blocco e una spaziatura verticale per categoria. Il trascinamento rimane libero.
- Ogni istanza presenta un segmento-pin separato dall'icona: a destra e diretto verso la FPGA per gli INPUT, a sinistra per gli OUTPUT. Il colore è neutro se scollegato e verde se associato.
- Il menu accanto al pin offre `— non connesso —`, espande i vettori VHDL nei singoli bit (per esempio `A(3)`), filtra Switch/Pulsanti sulle porte `in` e LED sulle porte `out`, e applica l'associazione locale 1:1. Un pin già assegnato scompare dagli altri menu compatibili e torna disponibile alla disconnessione.
- Switch alterna lo SVG al click; Push Button mostra `down` durante la pressione e `up` al rilascio. È esposta anche l'API locale `window.vivo.setLedState(nome, stato)` per il futuro pilotaggio del LED, senza introdurre alcun adattatore di simulazione.

Sono state estese le verifiche API per i sei asset e per i punti chiave del comportamento grafico. Non è stato installato, aggiornato o rimosso alcun software.

### Rifinitura UI delle connessioni

Successivamente, il 25 agosto 2026, la UI delle connessioni ViVoO è stata resa compatta senza modificare le regole di associazione locali già introdotte. Il selettore permanente è stato rimosso dalla scheda: un click sul solo pin apre ora un piccolo popover sovrapposto alla canvas; una scelta, inclusa `— non connesso —`, lo chiude subito.

I pin FPGA sono ora elementi grafici distinti e cambiano insieme al corrispondente pin ViVoO: azzurro quando non associati, verde quando associati. I pin ViVoO riusano esattamente la stessa geometria (28 px per 8 px, con identico tratto e freccia) dei pin FPGA, ruotando esclusivamente il verso degli OUTPUT. Le schede sono tornate al contenuto essenziale icona, nome e pin e il popover non occupa spazio nel loro layout. Non è stato installato, aggiornato o rimosso alcun software.

## Prova backend della simulazione ViVo persistente

Il 25 agosto 2026 è stata aggiunta una prova backend isolata dalla UI per verificare il primo passaggio della simulazione attiva ViVo. Il nuovo modulo `src/vivo-simulator.js` espone `GhdlPersistentSimulator` con operazioni `start()`, `send()` e `stop()`. Avvia GHDL tramite `child_process.spawn()` con `shell: false`, conserva le pipe stdin/stdout/stderr e associa in ordine una risposta su una riga a ogni comando inviato.

Il fixture `Test/ViVo/vivo_test.vhd` è un testbench AND2 interattivo basato su `TEXTIO`: legge due valori `bit` separati da spazio, assegna i segnali, attende due delta cycle, quindi risponde con `Y=<bit>` e torna subito alla lettura successiva. Il protocollo provvisorio verificato è quindi una riga `0 1` in ingresso e una riga `Y=0` in uscita.

Il test automatico compila il fixture in una directory temporanea e avvia una sola istanza con il comando effettivo:

```text
/usr/bin/ghdl -r --std=08 --workdir=<directory-temporanea> vivo_test --unbuffered
```

Sul medesimo PID GHDL ha ricevuto consecutivamente `0 0`, `0 1`, `1 0` e `1 1`, rispondendo rispettivamente `Y=0`, `Y=0`, `Y=0` e `Y=1`. La regressione copre anche timeout di risposta e chiusura inattesa con acquisizione di stderr; `stop()` chiude stdin e termina ordinatamente il figlio. Questa milestone non collega alcun controllo o pin della UI e non introduce Python nel prodotto. Non è stato installato, aggiornato o rimosso alcun software.

## Primo flusso completo ViVo con GHDL persistente

Il 25 agosto 2026 il motore persistente è stato collegato alla GUI ViVo tramite i soli endpoint locali `POST /api/vivo/start`, `POST /api/vivo/update` e `POST /api/vivo/stop`. `START` convalida le associazioni 1:1, richiede tutte le porte scalari `in/out` del design e avvia GHDL una sola volta; `STOP` termina il processo e restituisce il disegno allo stato modificabile. Durante RUN le associazioni, il trascinamento e l'importazione sono bloccati, mentre Switch e Push Button restano attivi.

Il backend genera in `.ufo/build/vivo-<id>/vivo_runtime_tb.vhd` un testbench temporaneo che istanzia il DUT senza modificare i sorgenti dell'utente. Per questa milestone supporta porte scalari `std_logic` e genera un loop `TEXTIO` che legge valori nel formato deterministico `A=1;B=0`, attende due delta cycle e risponde nel formato `Y=0` (più uscite sono separate da `;`). Il frontend invia l'intero stato degli ingressi a ogni transizione e applica le uscite ricevute ai LED.

Il test API end-to-end ha verificato AND2 con Switch→`A`, Push Button→`B` e LED→`Y`: `00→0`, `01→0`, `10→0`, `11→1`, sempre con lo stesso PID GHDL. Copre anche START incompleto, START/STOP e l'assenza della sessione dopo STOP; l'adapter sottostante mantiene le verifiche di timeout, stderr e chiusura inattesa. Nessun clock, display, bus, fan-out, persistenza del layout, Verilog o Icarus è stato introdotto. Non è stato installato, aggiornato o rimosso alcun software.

### Correzione dell'analisi dei sorgenti ViVo

Sempre il 25 agosto 2026 è stata corretta la preparazione della build ViVo quando un progetto contiene anche il proprio testbench. Il wrapper generato non richiede il testbench dell'utente e ora lo esclude: GHDL importa i soli sorgenti di design con `ghdl -i`, quindi elabora esplicitamente `vivo_runtime_tb` con `ghdl -m`. Questo evita che un file come `AND2_tb.vhd`, ordinato prima del DUT, venga analizzato prima di `AND2` e provochi l'errore `unit "and2" not found in library "work"`. I test del runtime e delle API sono stati rieseguiti con esito positivo. Non è stato installato, aggiornato o rimosso alcun software.

La correzione è stata inoltre verificata sul progetto reale `Workspace/AND2`, che contiene `src/AND2.vhd` e `src/AND2_tb.vhd`: START ha generato il wrapper nella build temporanea e avviato GHDL con PID `7673`. I quattro aggiornamenti consecutivi hanno restituito `Y=0`, `Y=0`, `Y=0` e `Y=1`, sempre sullo stesso PID; STOP ha poi restituito `active: false`. Non è stato installato, aggiornato o rimosso alcun software.

### Valori `std_logic` non binari durante ViVo

Sempre il 25 agosto 2026 il parser del protocollo ViVo è stato corretto per riconoscere anche gli stati validi ma non binari di `std_logic` (`U`, `X`, `Z`, `W`, `L`, `H`, `-`). Un flip-flop come `FFD`, prima dell'inizializzazione mediante reset e prima di un fronte di clock, può correttamente restituire `q=U`: non è una risposta GHDL malformata. ViVo mantiene ora attiva la simulazione, spegne il LED associato e riporta in console che quel valore non è ancora rappresentabile graficamente; i LED continuano a visualizzare soltanto `0` e `1`. Non è stato installato, aggiornato o rimosso alcun software.

### Rifiniture delle intestazioni e dei valori ViVoO

Il 25 agosto 2026 l'intestazione della libreria è stata rinominata `ViVo Objects`; il titolo del disegno è ora `Progetto Virtual in Virtual out · <Entity>` e mantiene titolo e nome Entity allineati a sinistra. Ogni ViVoO mostra inoltre il proprio valore binario corrente (`0` o `1`) accanto al pin con il medesimo carattere monospace del nome. Non è stato installato, aggiornato o rimosso alcun software.

## Display ViVo a 7 segmenti

Il 25 agosto 2026 è stato aggiunto alla sezione OUTPUT della libreria il componente `7 Segment` (`seven-segment`, `bitWidth: 7`, render dinamico). Usa un singolo SVG inline formato da sette poligoni DOM identificati `a`–`g`, senza combinazioni SVG pre-generate. L'ordine documentato del pattern è bit 6→`a`, 5→`b`, 4→`c`, 3→`d`, 2→`e`, 1→`f`, 0→`g`; per esempio la stringa `1011011` controlla direttamente quei sette segmenti nell'ordine indicato.

Il suo menu di connessione mostra soltanto porte FPGA `out` vettoriali di larghezza esattamente sette e associa il vettore completo (non i bit individuali), mantenendo il vincolo 1:1 e i normali pin/trascinamento. L'API locale `window.vivo.setSevenSegmentState(nome, pattern)` aggiorna i segmenti per ogni pattern binario di sette bit. Il runtime GHDL resta intenzionalmente limitato alle porte scalari in questa milestone: una connessione al display è quindi pronta graficamente e per l'API futura, ma non può ancora avviare la simulazione ViVo. Non è stato installato, aggiornato o rimosso alcun software.

### Runtime ViVo per l'uscita a 7 segmenti

Successivamente il runtime ViVo è stato esteso in modo mirato al display: gli ingressi restano scalari, mentre le uscite possono ora essere scalari oppure `std_logic_vector` a sette bit associati a `seven-segment`. Il wrapper temporaneo serializza il vettore dalla posizione alta alla bassa e restituisce, per esempio, `SEG=1011011`; il frontend inoltra il pattern direttamente al SVG del display. Il test end-to-end usa `SegmentDriver`, verifica `SEG=0000000` e `SEG=1011011` sullo stesso PID GHDL e poi arresta la sessione. Non è stato installato, aggiornato o rimosso alcun software.

### Runtime ViVo per bit di vettori in ingresso

Il runtime ViVo accetta ora anche ingressi vettoriali numerici attraverso i ViVoO INPUT già associati ai singoli bit. Per un ingresso `A(3 downto 0)`, quattro Switch o Push Button connessi a `A(3)`, `A(2)`, `A(1)` e `A(0)` vengono aggregati dal backend nel comando `A=0101`; il wrapper temporaneo redistribuisce i quattro caratteri sui rispettivi indici del segnale VHDL. Non è stato aggiunto un componente bus né una nuova UI di clock. Il test `VectorInputDriver` verifica che `1110` produca `Y=0` e `1111` produca `Y=1`. Non è stato installato, aggiornato o rimosso alcun software.

### Assestamento combinatorio del wrapper ViVo

Il wrapper runtime ViVo attende ora otto delta cycle (`wait for 0 ns`) dopo ogni aggiornamento degli ingressi, senza avanzare il tempo simulato. La correzione copre design combinatori come `Decoder`, nei quali i bit di ingresso alimentano prima segnali intermedi e solo successivamente le uscite; con due soli delta cycle la risposta poteva riflettere la configurazione precedente. Il test `DeltaDecoder` riproduce questa struttura e verifica il vettore di uscita aggiornato nella stessa richiesta. Non è stato installato, aggiornato o rimosso alcun software.

## Tastierino esadecimale ViVoO

Il 25 agosto 2026 è stato aggiunto il ViVoO INPUT `Hex Keypad` (`hex-keypad`, `bitWidth: 4`). La grafica è una griglia compatta 4×4 con i tasti `0..9` e `A..F`, senza SVG pre-generati: ogni pulsante è un elemento indipendente e il valore selezionato resta memorizzato, inizialmente `0000`, fino al click successivo. Il pin vettoriale unico è sul lato destro e mostra il valore binario corrente.

Il menu di associazione del tastierino accetta esclusivamente una porta FPGA `in` vettoriale di larghezza esatta 4 (connessione vettore-a-vettore); non espone porte scalari, larghezze diverse o singoli bit. Il runtime mantiene anche la modalità precedente con quattro ViVoO sui singoli bit, mentre il tastierino invia direttamente il valore completo, per esempio `A=1010`. L'API locale `window.vivo.setHexKeypadState(nome, valore)` aggiorna il tasto selezionato. Il test runtime verifica `1110→0`, `1111→1` sul medesimo PID GHDL e la suite completa passa con 32 test. Non è stato installato, aggiornato o rimosso alcun software.

### Correzione interazione tastierino

Il 25 agosto 2026 è stato corretto il rendering dell'istanza `Hex Keypad`: la griglia dell'istanza ora riceve i listener di click, mentre la sola anteprima nella libreria resta non interattiva. In precedenza il valore iniziale `0000` veniva evidenziato correttamente, ma tutti gli altri tasti erano creati senza handler e non potevano aggiornare l'uscita. Non è stato installato, aggiornato o rimosso alcun software.

### Uniformazione delle schede ViVoO

Il 25 agosto 2026 le schede ViVoO sono state uniformate: il nome dell'istanza (`SWn`, `BTNN`, `LEDn`, `KEYn` e `SEGn`) è ora sempre sotto il controllo grafico. Il valore corrente è stato spostato all'interno della scheda in un piccolo riquadro bordato; il testo esterno accanto al pin non mostra più il valore, ma il nome della porta FPGA associata ed è posizionato appena sopra la freccia. Non è stato installato, aggiornato o rimosso alcun software.

### Compattazione e posizionamento delle schede ViVoO

Il 25 agosto 2026 il nome dell'istanza è stato spostato sotto la BOX, che contiene ora solo il controllo e il valore corrente: le BOX risultano quindi più compatte senza ridurre la leggibilità. Le etichette delle porte FPGA associate sono ancorate al bordo della BOX, allineate a sinistra per gli INPUT e a destra per gli OUTPUT. Le nuove istanze INPUT e OUTPUT vengono infine collocate rispettivamente presso il margine sinistro e destro dell'area di disegno; il trascinamento libero resta invariato. Non è stato installato, aggiornato o rimosso alcun software.

L'ancoraggio delle etichette dei pin è espresso rispetto alla larghezza effettiva della BOX, non con una misura fissa: anche il `Hex Keypad` usa quindi il proprio bordo esterno come riferimento. Un margine di 8 px separa inoltre ogni etichetta dalla BOX. Non è stato installato, aggiornato o rimosso alcun software.

### Interazione e trascinamento delle BOX ViVoO

Il 25 agosto 2026 il cursore e la gestione del trascinamento sono stati resi coerenti: sulle BOX e sulle uscite appare il cursore di trascinamento; sugli INPUT il cursore puntatore compare soltanto sopra il simbolo interattivo. Switch e Push Button reagiscono al click o alla pressione sul simbolo, mentre il resto della BOX può essere trascinato. Non è stato installato, aggiornato o rimosso alcun software.

### Diagnostica delle connessioni ViVo

Il 25 agosto 2026 l'errore relativo a una connessione ViVo che non corrisponde al design è stato reso specifico: riporta ora il tipo e il pin della connessione estranea (per esempio `led→Z`) e l'elenco dei pin validi per il design selezionato. Le connessioni mancanti continuano a essere segnalate separatamente. Non è stato installato, aggiornato o rimosso alcun software.

La diagnostica riceve ora anche l'etichetta dell'istanza frontend: il messaggio identifica quindi il ViVoO concreto, per esempio `SW1→HEX_IN(3)`, anziché il solo tipo generico `switch`. Le chiamate API senza etichetta restano compatibili e usano il tipo come fallback. Non è stato installato, aggiornato o rimosso alcun software.

### Fan-out delle uscite vettoriali ViVo

Il 25 agosto 2026 le uscite vettoriali a 7 bit possono alimentare in parallelo il `7 Segment` collegato al vettore completo e uno o più LED collegati ai singoli bit, per esempio `SEG`→display e `SEG(6)`→LED. Il runtime conserva una sola lettura del vettore dal DUT; il frontend estrae il bit corretto per ciascun LED. Il display sul vettore completo resta richiesto per avviare la simulazione di un'uscita vettoriale supportata. Non è stato installato, aggiornato o rimosso alcun software.

### Regola di cardinalità delle connessioni ViVo

La regola architetturale ViVo è: un pin FPGA di **ingresso** può ricevere il segnale da un solo ViVoO INPUT, mentre un pin FPGA di **uscita** può alimentare più ViVoO OUTPUT (fan-out). Il supporto corrente consente già il fan-out da un vettore a 7 bit verso il display completo e LED collegati ai suoi bit; ogni futuro controllo di associazione e runtime deve preservare questa asimmetria, senza applicare alle uscite il vincolo 1:1 degli ingressi. Non è stato installato, aggiornato o rimosso alcun software.

### Nomenclatura visiva ViVo

Il 25 agosto 2026 il componente di uscita precedentemente mostrato come `7 Segment` è stato rinominato `Display7LED`; le sue istanze usano il prefisso `DIS` (`DIS1`, `DIS2`, …). L'identificatore tecnico `seven-segment` resta invariato per preservare le connessioni e il runtime. Il titolo dell'area di disegno è inoltre `Progetto Virtual-In-Virtual-Out`, così da rendere evidente l'acronimo ViVo. Non è stato installato, aggiornato o rimosso alcun software.

### Disponibilità del pulsante ViVo

Il 25 agosto 2026 è stato aggiunto l'endpoint autenticato `GET /api/vivo/status?project=<nome>`, che espone lo stato reale della sessione ViVo del progetto. La pagina principale aggiorna il pulsante `ViVo` quando cambia progetto, al ritorno in primo piano e periodicamente mentre è visibile: se una sessione è attiva il pulsante è disabilitato e indica che ViVo è già attiva per quel progetto; dopo `STOP` torna disponibile. Non è stato installato, aggiornato o rimosso alcun software.

## Rimozione degli oggetti ViVoO

Il 16 settembre 2026 è stata aggiunta la rimozione delle istanze ViVoO dalla finestra ViVo. Ogni BOX dispone ora di una `X` nell'angolo superiore destro, con etichetta accessibile e stato disabilitato durante `RUN`. La rimozione elimina anche l'eventuale associazione al pin FPGA e aggiorna immediatamente lo stato grafico del pin; per un oggetto connesso viene richiesta conferma.

La BOX selezionata è evidenziata e può essere rimossa anche con `Canc` o `Backspace`, senza interferire con il click interattivo di Switch, Push Button e tastierino. Dopo la rimozione è disponibile per sei secondi il comando `ANNULLA`, che ripristina oggetto, posizione, stato e connessione. La numerazione delle nuove istanze evita il riuso immediato di identificativi ancora potenzialmente presenti. Non è stato installato, aggiornato o rimosso alcun software.

La suite completa eseguita il 16 settembre 2026 ha prodotto 32 test superati su 32.

## Nomenclatura della rete logica in ViVo

Il 16 settembre 2026 la dicitura visibile `FPGA` nel blocco centrale della modalità ViVo è stata sostituita con `Rete Logica`. Sono stati aggiornati anche i testi accessibili e il messaggio della console relativi all'associazione dei pin, mantenendo invariati identificatori tecnici e comportamento. Non è stato installato, aggiornato o rimosso alcun software.

## Script di distribuzione e aggiornamento da GitHub

Il 28 settembre 2026 è stato aggiunto `ufo.sh` per la distribuzione agli studenti. Lo script usa il repository HTTPS di distribuzione `https://github.com/gmatrell/UFO-WA-studenti.git`, individua il tag stabile `vX.Y.Z` più recente, clona UFO nella `HOME` come `~/UFO-WA` quando la cartella non esiste e, alle esecuzioni successive, aggiorna il clone con checkout detached della release più recente.

Prima dell'aggiornamento verifica che il clone punti allo stesso repository e che non contenga modifiche locali o file non tracciati; in caso contrario si arresta senza sovrascrivere il lavoro. Non effettua downgrade se la copia locale dichiara una versione più recente della release pubblica. Le dipendenze JavaScript vengono ricostruite con `npm ci --ignore-scripts` soltanto quando il lockfile non è già registrato come allineato. GHDL, Yosys e GTKWave non vengono installati: lo script ne controlla soltanto la presenza e mostra un avviso.

La versione applicativa e quella del lockfile sono state predisposte a `1.9.5`, nuova release patch che userà il repository pubblico separato `UFO-WA-studenti`. Il tag precedente era `v1.9.4`; in questa fase non sono stati installati programmi. Il repository pubblico di distribuzione dovrà essere creato su GitHub e ricevere questa release prima del collaudo dalla macchina Ubuntu, quindi da ripetere su Rocky.
