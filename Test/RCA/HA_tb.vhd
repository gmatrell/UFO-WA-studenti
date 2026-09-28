library ieee;
use ieee.std_logic_1164.all;

entity HA_tb is
end HA_tb;

architecture test of HA_tb is

    signal A    : std_logic := '0';
    signal B    : std_logic := '0';
    signal SUM  : std_logic;
    signal COUT : std_logic;

begin

    UUT : entity work.HA
        port map (
            A    => A,
            B    => B,
            SUM  => SUM,
            COUT => COUT
        );

    stimulus : process
    begin
        A <= '0'; B <= '0';
        wait for 10 ns;

        A <= '0'; B <= '1';
        wait for 10 ns;

        A <= '1'; B <= '0';
        wait for 10 ns;

        A <= '1'; B <= '1';
        wait for 10 ns;

        wait;
    end process;

end test;
