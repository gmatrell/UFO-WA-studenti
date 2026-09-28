-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- DESIGN: Template

-- 1. LIBRARY (opzionale) - Dichiarazioni delle librerie

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity Template is
    port (
        NOME_PORTA_IN  : in  BIT;
        NOME_PORTA_OUT : out BIT
    );
end Template;

-- 3. ARCHITECTURE
architecture NOME_ARCHITETTURA of Template is

-- 3.1. Dichiarazione dei COMPONENT (opzionale)
-- 3.2. Dichiarazione dei SIGNAL (opzionale)
-- 3.3. Descrizione del sistema
begin

    -- L'uscita replica il valore presente all'ingresso
    NOME_PORTA_OUT <= NOME_PORTA_IN;

end NOME_ARCHITETTURA;


