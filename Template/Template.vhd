-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- DESIGN: template per il progetto di ENTITY

-- 1. LIBRARY - Dichiarazioni delle librerie
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity $NOME is
    port (
        ESEMPIO_PORTA_IN  : in  Std_logic;
        ESEMPIO_PORTA_OUT : out Std_logic
    );
end $NOME;

-- 3. ARCHITECTURE
architecture Behavior of $NOME is

-- 3.1. Dichiarazione dei SIGNAL
-- 3.2. Descrizione del sistema e istanziazione di COMPONENT
begin

    -- ESEMPIO: l'uscita replica il valore presente all'ingresso
    ESEMPIO_PORTA_OUT <= ESEMPIO_PORTA_IN;

end Behavior;
