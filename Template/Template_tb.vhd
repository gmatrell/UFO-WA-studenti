-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- TESTBENCH: template per la simulazione di ENTITY

-- 1. LIBRARY - Dichiarazioni delle librerie
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity $NOME_tb is
    -- Il testbench non possiede porte di ingresso o di uscita
end $NOME_tb;

-- 3. ARCHITECTURE
architecture Simulation of $NOME_tb is

-- 3.1. Dichiarazione dei SIGNAL
signal ESEMPIO_PORTA_IN_tb  : Std_logic;
signal ESEMPIO_PORTA_OUT_tb : Std_logic;

-- 3.2. Descrizione del sistema e istanziazione del Design Under Test
begin
    -- ETICHETTA: NOME_COMPONENTE
    -- port map (PORTA => SEGNALE, ...);
    DUT : entity work.$NOME
        port map (
            ESEMPIO_PORTA_IN  => ESEMPIO_PORTA_IN_tb,
            ESEMPIO_PORTA_OUT => ESEMPIO_PORTA_OUT_tb
        );

-- 3.3. Processo di generazione dei segnali di stimolo
    stimoli : process
    begin

        ESEMPIO_PORTA_IN_tb <= '0';
        wait for 10 ns;

        ESEMPIO_PORTA_IN_tb <= '1';
        wait for 10 ns;

        wait; -- Sospende definitivamente il processo

    end process stimoli;

end Simulation;
