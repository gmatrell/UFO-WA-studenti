library ieee;
use ieee.std_logic_1164.all;

entity FA_tb is
end FA_tb;

architecture test of FA_tb is

    signal A    : std_logic := '0';
    signal B    : std_logic := '0';
    signal CIN  : std_logic := '0';
    signal SUM  : std_logic;
    signal COUT : std_logic;

begin

    UUT : entity work.FA
        port map (
            A    => A,
            B    => B,
            CIN  => CIN,
            SUM  => SUM,
            COUT => COUT
        );

    stimulus : process
    begin

        A <= '0'; B <= '0'; CIN <= '0';
        wait for 10 ns;

        A <= '0'; B <= '0'; CIN <= '1';
        wait for 10 ns;

        A <= '0'; B <= '1'; CIN <= '0';
        wait for 10 ns;

        A <= '0'; B <= '1'; CIN <= '1';
        wait for 10 ns;

        A <= '1'; B <= '0'; CIN <= '0';
        wait for 10 ns;

        A <= '1'; B <= '0'; CIN <= '1';
        wait for 10 ns;

        A <= '1'; B <= '1'; CIN <= '0';
        wait for 10 ns;

        A <= '1'; B <= '1'; CIN <= '1';
        wait for 10 ns;

        wait;
    end process;

end test;
