library ieee;
use std.textio.all;

entity vivo_test is
end entity vivo_test;

architecture interactive of vivo_test is
  signal a_signal : bit := '0';
  signal b_signal : bit := '0';
  signal y_signal : bit := '0';
begin
  y_signal <= a_signal and b_signal;

  command_loop: process
    variable command_line : line;
    variable response_line : line;
    variable a_value : bit;
    variable b_value : bit;
  begin
    while true loop
      readline(input, command_line);
      read(command_line, a_value);
      read(command_line, b_value);
      a_signal <= a_value;
      b_signal <= b_value;
      wait for 0 ns;
      wait for 0 ns;
      write(response_line, string'("Y="));
      write(response_line, y_signal);
      writeline(output, response_line);
    end loop;
  end process command_loop;
end architecture interactive;
