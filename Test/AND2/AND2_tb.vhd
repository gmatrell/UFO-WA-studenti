library ieee;
use ieee.std_logic_1164.all;

entity AND2_tb is
end entity AND2_tb;

architecture sim of AND2_tb is
    signal a : std_logic := '0';
    signal b : std_logic := '0';
    signal y : std_logic;
begin
    dut : entity work.AND2
        port map (
            a => a,
            b => b,
            y => y
        );

    stimulus : process
    begin
        a <= '0';
        b <= '0';
        wait for 10 ns;
        assert y = '0' report "AND2 failed for 00" severity error;

        a <= '0';
        b <= '1';
        wait for 10 ns;
        assert y = '0' report "AND2 failed for 01" severity error;

        a <= '1';
        b <= '0';
        wait for 10 ns;
        assert y = '0' report "AND2 failed for 10" severity error;

        a <= '1';
        b <= '1';
        wait for 10 ns;
        assert y = '1' report "AND2 failed for 11" severity error;

        report "AND2 test completed successfully" severity note;
        wait;
    end process stimulus;
end architecture sim;
