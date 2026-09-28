library ieee;
use ieee.std_logic_1164.all;

entity OR2_tb is
end entity OR2_tb;

architecture sim of OR2_tb is
    signal a : std_logic := '0';
    signal b : std_logic := '0';
    signal y : std_logic;
begin
    dut : entity work.OR2
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
        

        a <= '0';
        b <= '1';
        wait for 10 ns;
        

        a <= '1';
        b <= '0';
        wait for 10 ns;
        

        a <= '1';
        b <= '1';
        wait for 10 ns;
        

        report "OR2 test completed successfully" severity note;
        wait;
    end process stimulus;
end architecture sim;
