library ieee;
use ieee.std_logic_1164.all;

entity HA is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        SUM  : out std_logic;
        COUT : out std_logic
    );
end HA;

architecture rtl of HA is
begin
    SUM  <= A xor B;
    COUT <= A and B;
end rtl;
