-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- TESTBENCH: Template

-- 1. LIBRARY (opzionale) - Dichiarazioni delle librerie

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity Template_tb is
    -- Il testbench non possiede porte di ingresso o di uscita
end Template_tb;

-- 3. ARCHITECTURE
architecture simulation of Template_tb is

-- 3.1. Dichiarazione dei COMPONENT
component Template
    port (
        NOME_PORTA_IN  : in  BIT;
        NOME_PORTA_OUT : out BIT
    );
end component;

-- 3.2. Dichiarazione dei SIGNAL
signal NOME_PORTA_IN_tb  : BIT;
signal NOME_PORTA_OUT_tb : BIT;

-- 3.3. Descrizione del sistema e istanziazione dei COMPONENT
begin

    -- ETICHETTA: NOME_COMPONENTE
    --     port map (PORTA => SEGNALE, ...);
    DUT : Template
        port map (
            NOME_PORTA_IN  => NOME_PORTA_IN_tb,
            NOME_PORTA_OUT => NOME_PORTA_OUT_tb
        );

-- 3.4. Processo di generazione dei segnali di stimolo
    stimoli : process
    begin

        NOME_PORTA_IN_tb <= '0';
        wait for 10 ns;

        NOME_PORTA_IN_tb <= '1';
        wait for 10 ns;

        wait; -- Sospende definitivamente il processo

    end process stimoli;

end simulation;
