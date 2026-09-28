library ieee;
use ieee.std_logic_1164.all;

entity OR2 is
    port (
        a : in  std_logic;
        b : in  std_logic;
        y : out std_logic
    );
end entity OR2;

architecture rtl of OR2 is
begin
    y <= a or b;
end architecture rtl;
