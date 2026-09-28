library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity RCA_tb is
end RCA_tb;

architecture tb of RCA_tb is

    signal A    : std_logic_vector(3 downto 0);
    signal B    : std_logic_vector(3 downto 0);
    signal CIN  : std_logic;
    signal SUM  : std_logic_vector(3 downto 0);
    signal COUT : std_logic;

begin

    DUT : entity work.RCA
        port map (
            A    => A,
            B    => B,
            CIN  => CIN,
            SUM  => SUM,
            COUT => COUT
        );

    stimulus : process
    begin

        CIN <= '0';

        for i in 0 to 15 loop
            for j in 0 to 15 loop

                A <= std_logic_vector(to_unsigned(i,4));
                B <= std_logic_vector(to_unsigned(j,4));

                wait for 20 ns;

            end loop;
        end loop;

        CIN <= '1';

        for i in 0 to 15 loop
            for j in 0 to 15 loop

                A <= std_logic_vector(to_unsigned(i,4));
                B <= std_logic_vector(to_unsigned(j,4));

                wait for 20 ns;

            end loop;
        end loop;

        wait;

    end process;

end tb;
