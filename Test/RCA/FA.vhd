library ieee;
use ieee.std_logic_1164.all;

entity FA is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        CIN  : in  std_logic;
        SUM  : out std_logic;
        COUT : out std_logic
    );
end FA;

architecture rtl of FA is

    signal s1 : std_logic;
    signal c1 : std_logic;
    signal c2 : std_logic;

begin

    HA1 : entity work.HA
        port map (
            A => A,
            B => B,
            SUM => s1,
            COUT => c1
        );

    HA2 : entity work.HA
        port map (
            A => s1,
            B => CIN,
            SUM => SUM,
            COUT => c2
        );

    COUT <= c1 or c2;

end rtl;
