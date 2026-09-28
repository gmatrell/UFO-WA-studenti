-- Fondamenti e Laboratorio di Elettronica Digitale
-- Prof. Guido Matrella
---------------------------------------------------
-- DESIGN: descrizione di un BUFFER

-- 1. LIBRARY (opzionale) - Dichiarazioni delle librerie

-- 2. ENTITY - Dichiarazione dell'ENTITY
entity My_buffer is
    port (
        My_buffer_in  : in  BIT;
        My_buffer_out : out BIT
    );
end entity My_buffer;

-- 3. ARCHITECTURE
architecture Behaviour of My_buffer is

-- 3.1. Dichiarazione dei COMPONENT (opzionale)
-- 3.2. Dichiarazione dei SIGNAL (opzionale)
-- 3.3. Descrizione del sistema
begin

    -- In un buffer, l'uscita replica il valore presente all'ingresso
    My_buffer_out <= My_buffer_in;

end architecture Behaviour;

