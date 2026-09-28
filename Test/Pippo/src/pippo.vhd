-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- DESIGN: template per la costruzione di una ENTITY

-- 1. LIBRARY (opzionale) - Dichiarazioni delle librerie

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity pippo is
    port (
        NOME_PORTA_IN  : in  BIT;
        NOME_PORTA_OUT : out BIT
    );
end pippo;

-- 3. ARCHITECTURE
architecture Behavior of pippo is

-- 3.1. Dichiarazione dei SIGNAL (opzionale)
-- 3.2. Descrizione del sistema e (opzionale, istanziazione di COMPONENT)
begin

    -- L'uscita replica il valore presente all'ingresso
    NOME_PORTA_OUT <= NOME_PORTA_IN;

end Behavior;


