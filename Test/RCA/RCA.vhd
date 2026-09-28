library ieee;
use ieee.std_logic_1164.all;

entity RCA is
    port (
        A    : in  std_logic_vector(3 downto 0);
        B    : in  std_logic_vector(3 downto 0);
        CIN  : in  std_logic;
        SUM  : out std_logic_vector(3 downto 0);
        COUT : out std_logic
    );
end RCA;

architecture rtl of RCA is

    signal c : std_logic_vector(4 downto 0);

begin

    c(0) <= CIN;

    FA0 : entity work.FA
        port map (
            A    => A(0),
            B    => B(0),
            CIN  => c(0),
            SUM  => SUM(0),
            COUT => c(1)
        );

    FA1 : entity work.FA
        port map (
            A    => A(1),
            B    => B(1),
            CIN  => c(1),
            SUM  => SUM(1),
            COUT => c(2)
        );

    FA2 : entity work.FA
        port map (
            A    => A(2),
            B    => B(2),
            CIN  => c(2),
            SUM  => SUM(2),
            COUT => c(3)
        );

    FA3 : entity work.FA
        port map (
            A    => A(3),
            B    => B(3),
            CIN  => c(3),
            SUM  => SUM(3),
            COUT => c(4)
        );

    COUT <= c(4);

end rtl;
