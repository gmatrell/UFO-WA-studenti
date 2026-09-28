library ieee;
use ieee.std_logic_1164.all;

entity AND2 is
    port (
        a : in  std_logic;
        b : in  std_logic;
        y : out std_logic
    );
end entity AND2;

architecture rtl of AND2 is
begin
    y <= a and b;
end architecture rtl;
