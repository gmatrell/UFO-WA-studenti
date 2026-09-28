-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- TESTBENCH: template per la simulazione di una ENTITY

-- 1. LIBRARY (opzionale) - Dichiarazioni delle librerie

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity pippo_tb is
    -- Il testbench non possiede porte di ingresso o di uscita
end pippo_tb;

-- 3. ARCHITECTURE
architecture Simulation of pippo_tb is

-- 3.1. Dichiarazione dei SIGNAL
signal NOME_PORTA_IN_tb  : BIT;
signal NOME_PORTA_OUT_tb : BIT;

-- 3.2. Descrizione del sistema e istanziazione del Design Under Test
begin

    -- ETICHETTA: NOME_COMPONENTE
    -- port map (PORTA => SEGNALE, ...);
    DUT : entity work.pippo
        port map (
            NOME_PORTA_IN  => NOME_PORTA_IN_tb,
            NOME_PORTA_OUT => NOME_PORTA_OUT_tb
        );

-- 3.3. Processo di generazione dei segnali di stimolo
    stimoli : process
    begin

        NOME_PORTA_IN_tb <= '0';
        wait for 10 ns;

        NOME_PORTA_IN_tb <= '1';
        wait for 10 ns;

        wait; -- Sospende definitivamente il processo

    end process stimoli;

end Simulation;
